"use client";

import { useEffect, useState } from "react";
import { CHANNEL_NAME, DISTANCES, EMPTY_EVENT, POINTS, totalPoints, type EventState, type Participant } from "../live-store";
import { fetchEvent } from "../sheets-api";

type DivisionName = "Advanced" | "Intermediate" | "Beginner";

function Division({ name, people, startRank, isFinal }: { name: DivisionName; people: Participant[]; startRank: number; isFinal: boolean }) {
  const winnerScore = people.length ? totalPoints(people[0]) : null;
  const divisionPosition = name === "Advanced" ? "Upper" : name === "Intermediate" ? "Middle" : "Lower";
  return <section className={`division division-${name.toLowerCase()}`}>
    <header className="division-title">
      <div><span>{name === "Advanced" ? "A" : name === "Intermediate" ? "I" : "B"}</span><div><p>{name} division</p><small>{people.length} {people.length === 1 ? "player" : "players"}</small></div></div>
      {people.length > 0 && <b>{divisionPosition} ⅓ by {isFinal ? "final" : "live"} score</b>}
    </header>
    <div className="leader-head"><span>PLACE</span><span aria-hidden="true" /><span>THROWS</span><span>ACES</span><span>SCORE</span></div>
    {people.map((person, index) => {
      const score = totalPoints(person);
      const isWinner = score === winnerScore;
      return <article className={isWinner ? "division-winner" : ""} key={person.id}><span className="place">{String(startRank + index).padStart(2, "0")}</span><strong>{person.name}{isWinner && <em>{isFinal ? "Winner" : "Current winner"}</em>}</strong><span>{person.throws.filter(Boolean).length} / 10</span><span>{person.throws.filter((item) => item?.outcome === "Ace").length}</span><b>{score} <small>PTS</small></b></article>;
    })}
    {!people.length && <div className="division-empty">This division will fill as scoring data comes in.</div>}
  </section>;
}

export default function LeaderboardPage() {
  const [event, setEvent] = useState<EventState>(EMPTY_EVENT);
  const [syncError, setSyncError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        setEvent(await fetchEvent(controller.signal));
        setSyncError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSyncError(error instanceof Error ? error.message : "Could not load event data.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (message) => setEvent(message.data);
    return () => { controller.abort(); window.clearInterval(timer); channel.close(); };
  }, []);
  const ranked = event.participants.filter((person) => person.throws.some(Boolean)).sort((a, b) => totalPoints(b) - totalPoints(a) || a.joinedAt.localeCompare(b.joinedAt));
  const advancedEnd = Math.ceil(ranked.length / 3);
  const intermediateEnd = Math.ceil((ranked.length * 2) / 3);
  const advanced = ranked.slice(0, advancedEnd);
  const intermediate = ranked.slice(advancedEnd, intermediateEnd);
  const beginner = ranked.slice(intermediateEnd);
  const waiting = event.participants.length - ranked.length;
  const isFinal = event.status === "complete";
  return <main className="leaderboard-shell">
    <header className="leaderboard-header"><div className="event-brand"><div><strong>Turkey Target Challenge 2026</strong></div></div><div className={`live-badge ${isFinal ? "final" : ""}`}><i /> {isFinal ? "Final leaderboard" : "Live scoring"}</div></header>
    <section className="score-reference leaderboard-score-reference" aria-label="Circle hit scoring">
      <span>Circle hit scoring</span>
      {DISTANCES.map((feet) => <div key={feet}><strong>{feet}<small>FT</small></strong><b>{POINTS[feet]} PTS</b></div>)}
      <p>Inside 3m / 15ft counts</p>
    </section>
    {syncError && <small className="sync-error leaderboard-sync-error">Google Sheets connection: {syncError}</small>}
    {ranked.length ? <div className="division-list"><Division name="Advanced" people={advanced} startRank={1} isFinal={isFinal} /><Division name="Intermediate" people={intermediate} startRank={advancedEnd + 1} isFinal={isFinal} /><Division name="Beginner" people={beginner} startRank={intermediateEnd + 1} isFinal={isFinal} />{waiting > 0 && <p className="waiting-count">{waiting} signed-up {waiting === 1 ? "participant is" : "participants are"} waiting to record a first throw.</p>}</div> : <section className="leader-list"><div className="leader-empty"><span>◎</span><h2>Waiting for the first scored throw</h2><p>Divisions form automatically as participants begin scoring.</p></div></section>}
  </main>;
}
