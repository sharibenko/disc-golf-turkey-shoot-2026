"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CHANNEL_NAME, DISTANCES, EMPTY_EVENT, POINTS, totalPoints, type Distance, type EventState, type ThrowOutcome } from "./live-store";
import { fetchEvent, saveEvent, SheetsApiError } from "./sheets-api";

export default function TurkeyShootPage() {
  const [event, setEvent] = useState<EventState>(EMPTY_EVENT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [distance, setDistance] = useState<Distance>(150);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const latest = await fetchEvent(signal);
      setEvent(latest);
      setSyncError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSyncError(error instanceof Error ? error.message : "Could not load event data.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);

  async function publish(next: EventState, suppliedPin?: string) {
    const savedPin = sessionStorage.getItem("turkey-shoot-admin-pin");
    const pin = suppliedPin ?? savedPin ?? window.prompt("Enter the event admin PIN to save scoring changes:");
    if (!pin) return false;
    setSaving(true);
    setSyncError(null);
    setEvent(next);
    try {
      const persisted = await saveEvent(next, pin);
      sessionStorage.setItem("turkey-shoot-admin-pin", pin);
      setEvent(persisted);
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(persisted);
      channel.close();
      return true;
    } catch (error) {
      if (error instanceof SheetsApiError && error.code === "UNAUTHORIZED") {
        sessionStorage.removeItem("turkey-shoot-admin-pin");
      }
      setSyncError(error instanceof Error ? error.message : "Could not save event data.");
      await refresh();
      return false;
    } finally {
      setSaving(false);
    }
  }

  function addParticipant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") || "").trim();
    if (!name) return;
    const participant = { id: crypto.randomUUID(), name, joinedAt: new Date().toISOString(), throws: Array(10).fill(null) };
    publish({ ...event, participants: [...event.participants, participant], acePot: event.acePot + 2 });
    form.reset();
    if (!selectedId) setSelectedId(participant.id);
  }

  function recordThrow(outcome: ThrowOutcome) {
    if (!selectedId) return;
    const participant = event.participants.find((item) => item.id === selectedId);
    if (!participant) return;
    const throwIndex = participant.throws.findIndex((item) => item === null);
    if (throwIndex < 0) return;
    const points = outcome === "Miss" ? 0 : POINTS[distance];
    const wonPot = outcome === "Ace" ? event.acePot : undefined;
    const participants = event.participants.map((item) => {
      if (item.id !== selectedId) return item;
      const throws = [...item.throws];
      throws[throwIndex] = { distance, outcome, points, acePayout: wonPot };
      return { ...item, throws, aceWon: wonPot !== undefined ? (item.aceWon || 0) + wonPot : item.aceWon };
    });
    publish({ participants, acePot: outcome === "Ace" ? 0 : event.acePot, lastAceWinner: outcome === "Ace" ? participant.name : event.lastAceWinner, revision: event.revision });
  }

  function undoLast() {
    if (!selectedId) return;
    const selectedPerson = event.participants.find((item) => item.id === selectedId);
    if (!selectedPerson) return;
    const lastIndex = selectedPerson.throws.findLastIndex((value) => value !== null);
    const lastThrow = lastIndex >= 0 ? selectedPerson.throws[lastIndex] : null;
    const participants = event.participants.map((item) => {
      if (item.id !== selectedId) return item;
      const throws = [...item.throws];
      if (lastIndex >= 0) throws[lastIndex] = null;
      return { ...item, throws, aceWon: lastThrow?.acePayout ? Math.max(0, (item.aceWon || 0) - lastThrow.acePayout) : item.aceWon };
    });
    publish({ ...event, participants, acePot: event.acePot + (lastThrow?.acePayout || 0), lastAceWinner: lastThrow?.outcome === "Ace" ? undefined : event.lastAceWinner });
  }

  async function resetEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("reset-password") || "");
    const reset = await publish({ ...EMPTY_EVENT, revision: event.revision }, password);
    if (!reset) {
      setResetError(true);
      return;
    }
    setSelectedId(null);
    setDistance(150);
    setResetError(false);
    setResetOpen(false);
  }

  function exportCsv() {
    const scored = [...event.participants].filter((person) => person.throws.some(Boolean)).sort((a, b) => totalPoints(b) - totalPoints(a) || a.joinedAt.localeCompare(b.joinedAt));
    const advancedEnd = Math.ceil(scored.length / 3);
    const intermediateEnd = Math.ceil((scored.length * 2) / 3);
    const divisions = new Map(scored.map((person, index) => [person.id, index < advancedEnd ? "Advanced" : index < intermediateEnd ? "Intermediate" : "Beginner"]));
    const throwHeaders = Array.from({ length: 10 }, (_, index) => [`Throw ${index + 1} Distance`, `Throw ${index + 1} Outcome`, `Throw ${index + 1} Points`, `Throw ${index + 1} Ace Payout`]).flat();
    const headers = ["Participant", "Signup Time", "Status", "Throws Recorded", "Total Points", "Current Division", "Aces", "Total Ace Winnings", "Current Rolling Ace Pot", ...throwHeaders];
    const rows = event.participants.map((person) => {
      const count = person.throws.filter(Boolean).length;
      const throwData = person.throws.flatMap<string | number>((item) => item ? [item.distance, item.outcome, item.points, item.acePayout || 0] : ["", "", "", ""]);
      return [person.name, new Date(person.joinedAt).toLocaleString(), count === 10 ? "Complete" : count ? "In progress" : "Waiting", count, totalPoints(person), divisions.get(person.id) || "Not yet ranked", person.throws.filter((item) => item?.outcome === "Ace").length, person.aceWon || 0, event.acePot, ...throwData];
    });
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    link.href = url;
    link.download = `turkey-shoot-backup-${stamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const selected = event.participants.find((item) => item.id === selectedId) || null;
  const throwCount = selected?.throws.filter(Boolean).length || 0;

  return (
    <main className="event-shell">
      <header className="event-header">
        <div className="event-brand"><span className="turkey-mark">TS</span><div><strong>Disc Golf Turkey Shoot</strong><small>Live scoring desk</small></div></div>
        <div className="header-actions"><div className="ace-pot"><small>ROLLING ACE POT</small><strong>${event.acePot}</strong></div><button type="button" className="export-trigger" onClick={exportCsv}>Save CSV ↓</button><button type="button" className="reset-trigger" onClick={() => setResetOpen(true)}>Reset event</button><Link href="/display" target="_blank">Open leaderboard ↗</Link></div>
      </header>
      {syncError && <div className="sync-alert" role="alert"><strong>Google Sheets connection:</strong> {syncError}</div>}

      <section className="score-reference">
        <span>Circle hit scoring</span>
        {DISTANCES.map((feet) => <div key={feet}><strong>{feet}<small>FT</small></strong><b>{POINTS[feet]} PTS</b></div>)}
        <p>Inside 3m / 15ft counts</p>
      </section>

      <section className="scoring-workspace">
        <aside className="signup-panel">
          <div className="panel-title"><div><p>STEP 01</p><h1>Signup queue</h1></div><span>{event.participants.length}</span></div>
          <form onSubmit={addParticipant} className="signup-form"><label htmlFor="participant-name">Participant name or nickname</label><div><input id="participant-name" name="name" required autoComplete="off" placeholder="Enter name…" /><button type="submit" aria-label="Add participant">+</button></div><small>$10 entry · $2 automatically added to ace pot</small></form>
          <div className="queue-list">
            {event.participants.map((person, index) => {
              const count = person.throws.filter(Boolean).length;
              return <button type="button" className={`queue-person ${selectedId === person.id ? "selected" : ""}`} key={person.id} onClick={() => setSelectedId(person.id)}><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><span className="queue-name"><strong>{person.name}</strong><small>{count === 10 ? `${totalPoints(person)} points · Finished` : count ? `${count}/10 throws recorded` : "Waiting to throw"}</small></span><b>{count === 10 ? "✓" : "→"}</b></button>;
            })}
            {event.participants.length === 0 && <div className="queue-empty"><span>◎</span><p>New participants will line up here.</p></div>}
          </div>
        </aside>

        <section className="throw-panel">
          <div className="panel-title throw-title"><div><p>STEP 02</p><h1>{selected ? selected.name : "Select a participant"}</h1></div>{selected && <div className="running-score"><small>RUNNING SCORE</small><strong>{totalPoints(selected)}<i>PTS</i></strong></div>}</div>
          {!selected ? <div className="select-prompt"><span>←</span><h2>Choose a name from the queue</h2><p>You can keep adding signups while another participant throws.</p></div> : <>
            <div className="throw-progress"><div><span>THROW</span><strong>{Math.min(throwCount + 1, 10)} <i>/ 10</i></strong></div><div className="progress-track"><i style={{ width: `${throwCount * 10}%` }} /></div><button type="button" onClick={undoLast} disabled={throwCount === 0 || saving}>Undo last</button></div>
            <div className="distance-picker"><p>1. Choose basket distance</p><div>{DISTANCES.map((feet) => <button type="button" className={distance === feet ? "active" : ""} onClick={() => setDistance(feet)} key={feet}><strong>{feet}</strong><small>FT · {POINTS[feet]} PTS</small></button>)}</div></div>
            <div className="outcome-picker"><p>2. Record result</p><div><button type="button" className="miss-button" onClick={() => recordThrow("Miss")} disabled={throwCount === 10}><span>×</span><strong>Miss</strong><small>0 points</small></button><button type="button" className="circle-button" onClick={() => recordThrow("Circle")} disabled={throwCount === 10}><span>●</span><strong>Inside circle</strong><small>+{POINTS[distance]} points</small></button><button type="button" className="ace-button" onClick={() => recordThrow("Ace")} disabled={throwCount === 10}><span>★</span><strong>Ace!</strong><small>Win ${event.acePot} pot</small></button></div></div>
            <div className="throw-strip">{selected.throws.map((item, index) => <div className={item ? item.outcome.toLowerCase() : ""} key={index}><small>{index + 1}</small>{item ? <><strong>{item.points}</strong><span>{item.distance}ft · {item.outcome}</span></> : <><strong>—</strong><span>Not thrown</span></>}</div>)}</div>
            {throwCount === 10 && <div className="complete-banner"><span>✓</span><div><strong>Round complete — {totalPoints(selected)} points</strong><p>Select the next participant from the signup queue.</p></div></div>}
          </>}
        </section>
      </section>
      {resetOpen && <div className="reset-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setResetOpen(false); }}>
        <section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <button type="button" className="reset-close" onClick={() => { setResetOpen(false); setResetError(false); }} aria-label="Close reset dialog">×</button>
          <span className="reset-icon">!</span><p>PROTECTED ACTION</p><h2 id="reset-title">Reset the entire event?</h2>
          <p className="reset-warning">This permanently clears every participant, throw, score, division, ace winner, and the rolling ace pot on this computer.</p>
          <form onSubmit={resetEvent}><label htmlFor="reset-password">Event password</label><input id="reset-password" name="reset-password" type="password" autoFocus required autoComplete="off" placeholder="Enter password" onChange={() => setResetError(false)} />
            {resetError && <span className="reset-error" role="alert">The reset could not be authorized. Nothing was reset.</span>}
            <div><button type="button" onClick={() => { setResetOpen(false); setResetError(false); }}>Cancel</button><button type="submit">Reset all event data</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
