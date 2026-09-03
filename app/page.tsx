"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bestRounds, CHANNEL_NAME, DISTANCES, EMPTY_EVENT, normalizeEmail, POINTS, pointsForOutcome, roundNumber, THROWS_PER_ROUND, totalPoints, type Distance, type EventState, type ThrowOutcome } from "./live-store";
import { fetchEvent, saveEvent, SheetsApiError } from "./sheets-api";

export default function TurkeyShootPage() {
  const [event, setEvent] = useState<EventState>(EMPTY_EVENT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [distance, setDistance] = useState<Distance>(200);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<"all" | "active" | "finished">("all");
  const [queueFocused, setQueueFocused] = useState(false);
  const [editingScores, setEditingScores] = useState(false);
  const saveInFlight = useRef(false);

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
    if (saveInFlight.current) return null;
    const savedPin = sessionStorage.getItem("turkey-shoot-admin-pin");
    const pin = suppliedPin ?? savedPin ?? window.prompt("Enter the event admin PIN to save scoring changes:");
    if (!pin) return null;
    saveInFlight.current = true;
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
      return persisted;
    } catch (error) {
      if (error instanceof SheetsApiError && error.code === "UNAUTHORIZED") {
        sessionStorage.removeItem("turkey-shoot-admin-pin");
      }
      setSyncError(error instanceof Error ? error.message : "Could not save event data.");
      await refresh();
      return null;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  function addParticipant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (event.status === "complete") return;
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") || "").trim();
    const email = normalizeEmail(String(new FormData(form).get("email") || ""));
    if (!name || !email) return;
    const participant = { id: crypto.randomUUID(), name, email, joinedAt: new Date().toISOString(), completedAt: null, throws: Array(THROWS_PER_ROUND).fill(null) };
    publish({ ...event, participants: [participant, ...event.participants] });
    form.reset();
    if (!selectedId) setSelectedId(participant.id);
  }

  function recordThrow(outcome: ThrowOutcome) {
    if (!selectedId || event.status === "complete") return;
    const participant = event.participants.find((item) => item.id === selectedId);
    if (!participant) return;
    const throwIndex = participant.throws.findIndex((item) => item === null);
    if (throwIndex < 0) return;
    const points = pointsForOutcome(distance, outcome);
    const participants = event.participants.map((item) => {
      if (item.id !== selectedId) return item;
      const throws = [...item.throws];
      throws[throwIndex] = { distance, outcome, points };
      return { ...item, throws, completedAt: throws.every(Boolean) ? new Date().toISOString() : item.completedAt };
    });
    publish({ ...event, participants });
  }

  function undoLast() {
    if (!selectedId || event.status === "complete") return;
    const selectedPerson = event.participants.find((item) => item.id === selectedId);
    if (!selectedPerson) return;
    const lastIndex = selectedPerson.throws.findLastIndex((value) => value !== null);
    const participants = event.participants.map((item) => {
      if (item.id !== selectedId) return item;
      const throws = [...item.throws];
      if (lastIndex >= 0) throws[lastIndex] = null;
      return { ...item, throws, completedAt: null };
    });
    publish({ ...event, participants });
  }

  async function deleteThrow(throwIndex: number) {
    if (!selectedId || event.status === "complete" || !editingScores) return;
    const participants = event.participants.map((item) => {
      if (item.id !== selectedId) return item;
      const throws = [...item.throws];
      throws[throwIndex] = null;
      return { ...item, throws, completedAt: null };
    });
    const persisted = await publish({ ...event, participants });
    if (!persisted) return;
    setEditingScores(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".distance-picker button")?.focus());
  }

  async function startAnotherRound() {
    if (!selected || event.status === "complete" || selected.throws.filter(Boolean).length !== THROWS_PER_ROUND) return;
    const participant = {
      id: crypto.randomUUID(),
      name: selected.name,
      email: normalizeEmail(selected.email),
      joinedAt: new Date().toISOString(),
      completedAt: null,
      throws: Array(THROWS_PER_ROUND).fill(null),
    };
    const persisted = await publish({ ...event, participants: [participant, ...event.participants] });
    if (!persisted) return;
    setSelectedId(participant.id);
    setEditingScores(false);
    setQueueSearch("");
    setQueueFilter("active");
    setQueueFocused(true);
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
    setQueueFocused(false);
    setEditingScores(false);
    setDistance(200);
    setResetError(false);
    setResetOpen(false);
  }

  function exportCsv(source: EventState = event) {
    const scored = bestRounds(source.participants);
    const advancedEnd = Math.ceil(scored.length / 3);
    const intermediateEnd = Math.ceil((scored.length * 2) / 3);
    const divisions = new Map(scored.map((person, index) => [person.id, index < advancedEnd ? "Advanced" : index < intermediateEnd ? "Intermediate" : "Beginner"]));
    const throwHeaders = Array.from({ length: THROWS_PER_ROUND }, (_, index) => [`Throw ${index + 1} Distance`, `Throw ${index + 1} Outcome`, `Throw ${index + 1} Points`]).flat();
    const headers = ["Participant", "Email", "Paid Round", "Signup Time", "Completion Time", "Status", "Throws Recorded", "Total Points", "Leaderboard Round", "Current Division", "Aces", ...throwHeaders];
    const rows = source.participants.map((person) => {
      const count = person.throws.filter(Boolean).length;
      const throwData = person.throws.flatMap<string | number>((item) => item ? [item.distance, item.outcome, item.points] : ["", "", ""]);
      return [person.name, person.email, roundNumber(person, source.participants), new Date(person.joinedAt).toLocaleString(), person.completedAt ? new Date(person.completedAt).toLocaleString() : "", count === THROWS_PER_ROUND ? "Complete" : count ? "In progress" : "Waiting", count, totalPoints(person), scored.some((round) => round.id === person.id) ? "Best score" : "Superseded", divisions.get(person.id) || "Not ranked", person.throws.filter((item) => item?.outcome === "Ace").length, ...throwData];
    });
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    link.href = url;
    link.download = `turkey-target-challenge-final-${stamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function completeScoring() {
    if (event.status === "complete") {
      exportCsv();
      return;
    }
    if (!window.confirm("Complete scoring and publish the final leaderboard? Further scoring will be locked until the event is reset.")) return;
    const completed = await publish({ ...event, status: "complete", completedAt: new Date().toISOString() });
    if (completed) exportCsv(completed);
  }

  const selected = event.participants.find((item) => item.id === selectedId) || null;
  const throwCount = selected?.throws.filter(Boolean).length || 0;
  const nextThrowIndex = selected?.throws.findIndex((item) => item === null) ?? -1;
  const currentThrowNumber = nextThrowIndex >= 0 ? nextThrowIndex + 1 : THROWS_PER_ROUND;
  const scoringComplete = event.status === "complete";
  const hasScores = event.participants.some((person) => person.throws.some(Boolean));
  const normalizedQueueSearch = queueSearch.trim().toLocaleLowerCase();
  const signupNumberById = new Map([...event.participants]
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
    .map((person, index) => [person.id, index + 1]));
  const visibleParticipants = [...event.participants]
    .filter((person) => !queueFocused || !selectedId || person.id === selectedId)
    .filter((person) => {
      const finished = person.throws.filter(Boolean).length === THROWS_PER_ROUND;
      return queueFilter === "all" || (queueFilter === "finished" ? finished : !finished);
    })
    .filter((person) => `${person.name} ${person.email}`.toLocaleLowerCase().includes(normalizedQueueSearch))
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));

  return (
    <main className="event-shell">
      <header className="event-header">
        <div className="event-brand"><div><strong>Turkey Target Challenge 2026</strong><small>Live scoring desk</small></div></div>
        <div className="header-actions"><Link href="/display" target="_blank">Open leaderboard ↗</Link></div>
      </header>
      {syncError && <div className="sync-alert" role="alert"><strong>Google Sheets connection:</strong> {syncError}</div>}
      {scoringComplete && <div className="event-complete-alert" role="status"><strong>Scoring complete</strong><span>The final leaderboard is published. Scoring controls are locked.</span></div>}

      <section className="scoring-workspace">
        <aside className="signup-panel">
          <form onSubmit={addParticipant} className="signup-form"><div className="signup-fields-row"><div className="signup-field"><label htmlFor="participant-name">Player name</label><input id="participant-name" name="name" required autoComplete="name" placeholder={scoringComplete ? "Scoring complete" : "Display name…"} disabled={scoringComplete || saving} /></div><div className="signup-field"><label htmlFor="participant-email">Email address</label><div className="signup-submit-row"><input id="participant-email" name="email" type="email" required autoComplete="email" placeholder={scoringComplete ? "Scoring complete" : "player@example.com"} disabled={scoringComplete || saving} /><button type="submit" aria-label="Add paid round" disabled={scoringComplete || saving}>+</button></div></div></div></form>
          <div className="queue-tools">
            <label><span>Search players</span><input type="search" value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search by name…" /></label>
            <label><span>Show players</span><select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as typeof queueFilter)}><option value="all">All players</option><option value="active">Active rounds</option><option value="finished">Finished rounds</option></select></label>
          </div>
          {queueFocused && selected && <button type="button" className="queue-show-all" onClick={() => setQueueFocused(false)}>← Show all players</button>}
          <div className="queue-list">
            {visibleParticipants.map((person) => {
              const count = person.throws.filter(Boolean).length;
              const paidRound = roundNumber(person, event.participants);
              return <button type="button" className={`queue-person ${selectedId === person.id ? "selected" : ""}`} key={person.id} onClick={() => { setSelectedId(person.id); setQueueFocused(true); setEditingScores(false); }}><span className="queue-number">{String(signupNumberById.get(person.id) || 0).padStart(2, "0")}</span><span className="queue-name"><strong>{person.name} · Round {paidRound}</strong><small>{person.email}</small><small>{count === THROWS_PER_ROUND ? `${totalPoints(person)} points · Finished${person.completedAt ? ` · ${new Date(person.completedAt).toLocaleString()}` : ""}` : count ? `${count}/${THROWS_PER_ROUND} throws recorded` : "Waiting to throw"}</small></span><b>{count === THROWS_PER_ROUND ? "✓" : "→"}</b></button>;
            })}
            {event.participants.length === 0 && <div className="queue-empty"><span>◎</span><p>New participants will line up here.</p></div>}
            {event.participants.length > 0 && visibleParticipants.length === 0 && <div className="queue-empty"><span>⌕</span><p>{queueSearch ? `No players match “${queueSearch}”.` : queueFilter === "active" ? "No active rounds." : queueFilter === "finished" ? "No finished rounds yet." : "No players to display."}</p></div>}
          </div>
        </aside>

        <section className="throw-panel">
          <div className="panel-title throw-title"><div><p>STEP 02</p><h1>{selected ? selected.name : "Select a participant"}</h1></div>{selected && <div className="running-score"><small>RUNNING SCORE</small><strong>{totalPoints(selected)}<i>PTS</i></strong></div>}</div>
          {!selected ? <div className="select-prompt"><span>←</span><h2>Choose a name from the queue</h2><p>You can keep adding signups while another participant throws.</p></div> : <>
            <div className="throw-progress"><div><span>THROW</span><strong>{currentThrowNumber} <i>/ {THROWS_PER_ROUND}</i></strong></div><div className="progress-track"><i style={{ width: `${(throwCount / THROWS_PER_ROUND) * 100}%` }} /></div><button type="button" onClick={throwCount === THROWS_PER_ROUND ? () => setEditingScores((current) => !current) : undoLast} disabled={throwCount === 0 || saving || scoringComplete}>{throwCount === THROWS_PER_ROUND ? editingScores ? "Cancel editing" : "Edit Scores" : "Undo last"}</button></div>
            {throwCount === THROWS_PER_ROUND && <div className="complete-banner"><span>✓</span><div><strong>Round {roundNumber(selected, event.participants)} complete — {totalPoints(selected)} points</strong><p>This score remains in the event record. Only this player’s highest-scoring round appears on the leaderboard.</p></div>{!scoringComplete && <button type="button" onClick={startAnotherRound} disabled={saving}>{saving ? "Starting…" : "Start another round"}</button>}</div>}
            {throwCount < THROWS_PER_ROUND && <><div className="distance-picker"><p>1. Choose basket distance</p><div>{DISTANCES.map((feet) => <button type="button" className={distance === feet ? "active" : ""} onClick={() => setDistance(feet)} disabled={saving || scoringComplete} key={feet}><strong>{feet}<small>ft</small></strong><span>{POINTS[feet]} Points</span></button>)}</div></div>
            <div className="outcome-picker" aria-busy={saving}><p aria-live="polite">{scoringComplete ? "Scoring is complete" : saving ? "Saving…" : "2. Record result"}</p><div><button type="button" className="miss-button" onClick={() => recordThrow("Miss")} disabled={saving || scoringComplete}><span>×</span><strong>Miss</strong><small>0 points</small></button><button type="button" className="circle-button" onClick={() => recordThrow("Circle")} disabled={saving || scoringComplete}><span>●</span><strong>Inside circle</strong><small>+{pointsForOutcome(distance, "Circle")} points</small></button><button type="button" className="ace-button" onClick={() => recordThrow("Ace")} disabled={saving || scoringComplete}><span>★</span><strong>Ace!</strong><small>+{pointsForOutcome(distance, "Ace")} points</small></button></div></div></>}
            <div className={`throw-strip ${editingScores ? "editing" : ""}`}>{selected.throws.map((item, index) => <div className={item ? item.outcome.toLowerCase() : ""} key={index}><small>{index + 1}</small>{item ? <>{editingScores && <button type="button" className="throw-delete" onClick={() => deleteThrow(index)} disabled={saving} aria-label={`Delete throw ${index + 1}`}>×</button>}<strong>{item.points}</strong><span>{item.distance}ft · {item.outcome}</span></> : <><strong>—</strong><span>Not thrown</span></>}</div>)}</div>
          </>}
        </section>
      </section>
      <footer className="event-footer">
        <div className="event-footer-copy"><small>END OF EVENT TOOLS</small><span>{scoringComplete ? "The event is finalized. Download another copy or reset when ready." : "Finalize the leaderboard and download its CSV backup."}</span></div>
        <div className="event-footer-actions"><button type="button" className="export-trigger" onClick={completeScoring} disabled={saving || (!scoringComplete && !hasScores)}>{saving ? "Completing…" : scoringComplete ? "Download Final CSV ↓" : "End Event"}</button><button type="button" className="reset-trigger" onClick={() => setResetOpen(true)}>Reset event</button></div>
      </footer>
      {resetOpen && <div className="reset-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setResetOpen(false); }}>
        <section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <button type="button" className="reset-close" onClick={() => { setResetOpen(false); setResetError(false); }} aria-label="Close reset dialog">×</button>
          <span className="reset-icon">!</span><p>PROTECTED ACTION</p><h2 id="reset-title">Reset the entire event?</h2>
          <p className="reset-warning">This permanently clears every participant, throw, score, and division in the connected event.</p>
          <form onSubmit={resetEvent}><label htmlFor="reset-password">Event password</label><input id="reset-password" name="reset-password" type="password" autoFocus required autoComplete="off" placeholder="Enter password" onChange={() => setResetError(false)} />
            {resetError && <span className="reset-error" role="alert">The reset could not be authorized. Nothing was reset.</span>}
            <div><button type="button" onClick={() => { setResetOpen(false); setResetError(false); }}>Cancel</button><button type="submit">Reset all event data</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
