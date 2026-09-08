"use client";

import { useEffect, useState } from "react";
import { LeaderboardView } from "../leaderboard-view";
import { DEMO_STEP_MS, demoSnapshot } from "./simulation";
import "./demo.css";

export default function DemoPage() {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), DEMO_STEP_MS);
    return () => window.clearInterval(timer);
  }, [paused]);
  const event = demoSnapshot(tick);
  return <LeaderboardView event={event} demoControls={
    <section className="demo-banner" aria-label="Leaderboard demo">
      <div><strong>Event preview · Simulated scores</strong><p>Pro names are for demonstration only, not registered entrants.</p><p>{paused ? "Demo paused." : event.status === "complete" ? "Final results — a new demo event starts shortly." : "Watch scores change and players move between divisions."}</p></div>
    </section>
  } footer={
      <footer className="demo-controls" aria-label="Demo playback controls">
        <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? "Resume" : "Pause"}</button>
        <button type="button" onClick={() => { setTick(0); setPaused(false); }}>Restart</button>
      </footer>
  } />;
}
