"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { bestRounds, DISTANCES, POINTS, THROWS_PER_ROUND, totalPoints, type EventState, type Participant } from "./live-store";

type DivisionName = "Top Turkeys" | "Middle of the Flock" | "Wild Gobblers";

function Division({ name, people, isFinal, selected }: { name: DivisionName; people: Participant[]; isFinal: boolean; selected: boolean }) {

  const ribbonColor = name === "Top Turkeys" ? "Yellow" : name === "Middle of the Flock" ? "Orange" : "Green";
  const divisionPosition = name === "Top Turkeys" ? "Upper" : name === "Middle of the Flock" ? "Middle" : "Lower";
  const divisionClass = name === "Top Turkeys" ? "top-turkeys" : name === "Middle of the Flock" ? "middle-flock" : "wild-gobblers";
  return <section id={`division-${divisionClass}`} aria-label={name} data-selected={selected} className={`division division-${divisionClass}`}>
    <header className="division-title">
      <div><Image className="division-icon" src={`../${divisionClass}-icon.svg`} alt="" width={64} height={64} unoptimized /><div><p>{name}</p><small className="division-player-count">{people.length} {people.length === 1 ? "player" : "players"}{people.length > 0 && <span className="mobile-division-range"> · {divisionPosition === "Upper" ? "Top" : divisionPosition === "Lower" ? "Bottom" : "Middle"} ⅓ of scores</span>}</small></div></div>
      {people.length > 0 && <b>{divisionPosition} ⅓ by {isFinal ? "final" : "live"} score</b>}
    </header>
    {people.map((person, index) => {
      const score = totalPoints(person);
      const podiumPlace = ["1st", "2nd", "3rd"][index];
      return <article className={podiumPlace ? "division-winner" : ""} key={person.id}><span className="place">{podiumPlace ? <em className="podium-ribbon" aria-label={`${isFinal ? "" : "Current "}${podiumPlace} place`}><Image src={`../${ribbonColor}${["First", "Second", "Third"][index]}Place.svg`} alt={`${isFinal ? "" : "Current "}${podiumPlace} place`} width={137} height={169} unoptimized /></em> : String(index + 1).padStart(2, "0")}</span><strong><span className="player-name">{person.name}</span></strong><span className="player-throws"><span className="mobile-throws-label">Throws: </span>{person.throws.filter(Boolean).length} / {THROWS_PER_ROUND}</span><span>{person.throws.filter((item) => item?.outcome === "Ace").length}</span><b>{score} <small>PTS</small></b></article>;
    })}
    {!people.length && <div className="division-empty">This division will fill as scoring data comes in.</div>}
  </section>;
}

export function LeaderboardView({ event, syncError = null, demoControls, footer }: { event: EventState; syncError?: string | null; demoControls?: ReactNode; footer?: ReactNode }) {
  const [selectedDivision, setSelectedDivision] = useState<DivisionName>("Top Turkeys");
  const ranked = bestRounds(event.participants);
  const advancedEnd = Math.ceil(ranked.length / 3);
  const intermediateEnd = Math.ceil((ranked.length * 2) / 3);
  const advanced = ranked.slice(0, advancedEnd);
  const intermediate = ranked.slice(advancedEnd, intermediateEnd);
  const beginner = ranked.slice(intermediateEnd);
  const waiting = event.participants.filter((person) => !person.throws.some(Boolean)).length;
  const isFinal = event.status === "complete";
  return <main className="leaderboard-shell">
    {demoControls}
    <header className="leaderboard-header"><div className="event-brand leaderboard-brand"><Image className="leaderboard-logo" src="../ttc-logo-leaderboard.svg" alt="Turkey Target Challenge 2026" width={1691} height={183} unoptimized priority /></div><div className={`live-badge ${isFinal ? "final" : ""}`}><i /> {demoControls ? (isFinal ? "Demo results" : "Demo scoring") : (isFinal ? "Final leaderboard" : "Live scoring")}</div></header>
    <section className="score-reference leaderboard-score-reference" aria-label="Circle hit scoring">
      <span>$10 for 6 Throws</span>
      {DISTANCES.map((feet) => <div key={feet}><strong>{feet}<small>FT</small></strong><b>{POINTS[feet]} PTS</b><small className="ace-reference"><span className="ace-label">Ace</span>{" "}<span>{POINTS[feet] * 2} PTS</span></small></div>)}
      <p><span className="mobile-entry-price">$10 for 6 Throws | </span>Inside 3m / 15ft counts</p>
    </section>
    <p className="division-prize-note">Top 3 scores in each division wins a gift card for the price of a turkey.</p>
    {syncError && <small className="sync-error leaderboard-sync-error">Google Sheets connection: {syncError}</small>}
    {ranked.length ? <div className="division-list"><nav className="division-tabs" aria-label="Choose division">{(["Top Turkeys", "Middle of the Flock", "Wild Gobblers"] as const).map((name, index) => <button key={name} type="button" aria-pressed={selectedDivision === name} aria-controls={`division-${["top-turkeys", "middle-flock", "wild-gobblers"][index]}`} onClick={() => setSelectedDivision(name)}>Division {index + 1}</button>)}</nav><Division name="Top Turkeys" selected={selectedDivision === "Top Turkeys"} people={advanced} isFinal={isFinal} /><Division name="Middle of the Flock" selected={selectedDivision === "Middle of the Flock"} people={intermediate} isFinal={isFinal} /><Division name="Wild Gobblers" selected={selectedDivision === "Wild Gobblers"} people={beginner} isFinal={isFinal} />{waiting > 0 && <p className="waiting-count">{waiting} paid {waiting === 1 ? "round is" : "rounds are"} waiting to record a first throw.</p>}</div> : <section className="leader-list"><div className="leader-empty"><span>◎</span><h2>Waiting for the first scored throw</h2><p>Divisions form automatically from each player’s best round.</p></div></section>}
    {footer}
  </main>;
}
