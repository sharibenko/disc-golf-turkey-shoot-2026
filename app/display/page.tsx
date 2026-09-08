"use client";

import { useEffect, useState } from "react";
import { CHANNEL_NAME, EMPTY_EVENT, type EventState } from "../live-store";
import { fetchEvent } from "../sheets-api";
import { LeaderboardView } from "../leaderboard-view";

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
  return <LeaderboardView event={event} syncError={syncError} />;
}