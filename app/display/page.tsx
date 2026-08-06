"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHANNEL_NAME, EMPTY_EVENT, totalPoints, type EventState, type Participant } from "../live-store";
import { fetchEvent } from "../sheets-api";

const MAX_SCORE = 250;
type DivisionName = "Advanced" | "Intermediate" | "Beginner";

function Division({ name, people, startRank }: { name: DivisionName; people: Participant[]; startRank: number }) {
  const winnerScore = people.length ? totalPoints(people[0]) : null;
  const scores = people.map(totalPoints);
  const range = people.length ? `${Math.min(...scores)}–${name === "Advanced" ? MAX_SCORE : Math.max(...scores)} pts` : "Awaiting scores";
  return <section className={`division division-${name.toLowerCase()}`}>
    <header className="division-title">
      <div><span>{name === "Advanced" ? "A" : name === "Intermediate" ? "I" : "B"}</span><div><p>{name} division</p><small>{range} · {people.length} {people.length === 1 ? "player" : "players"}</small></div></div>
      {people.length > 0 && <b>Top ⅓ by live score</b>}
    </header>
    <div className="leader-head"><span>PLACE</span><span aria-hidden="true" /><span>THROWS</span><span>ACES</span><span>SCORE</span></div>
    {people.map((person, index) => {
      const score = totalPoints(person);
      const isWinner = score === winnerScore;
      return <article className={isWinner ? "division-winner" : ""} key={person.id}><span className="place">{String(startRank + index).padStart(2, "0")}</span><strong>{person.name}{isWinner && <em>Current winner</em>}</strong><span>{person.throws.filter(Boolean).length} / 10</span><span>{person.throws.filter((item) => item?.outcome === "Ace").length}</span><b>{score} <small>PTS</small></b></article>;
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
  return <main className="leaderboard-shell">
    <header className="leaderboard-header"><div className="event-brand"><div><strong>Disc Golf Turkey Shoot</strong></div></div><div className="live-badge"><i /> Live scoring</div><Link href="/">Scoring desk</Link></header>
    <section className="leaderboard-hero"><div><p>THREE LIVE PRIZE DIVISIONS</p><h1>Leaderboard</h1>{syncError && <small className="sync-error">Google Sheets connection: {syncError}</small>}</div></section>
    {ranked.length ? <div className="division-list"><Division name="Advanced" people={advanced} startRank={1} /><Division name="Intermediate" people={intermediate} startRank={advancedEnd + 1} /><Division name="Beginner" people={beginner} startRank={intermediateEnd + 1} />{waiting > 0 && <p className="waiting-count">{waiting} signed-up {waiting === 1 ? "participant is" : "participants are"} waiting to record a first throw.</p>}</div> : <section className="leader-list"><div className="leader-empty"><span>◎</span><h2>Waiting for the first scored throw</h2><p>Divisions form automatically as participants begin scoring.</p></div></section>}
  </main>;
}
