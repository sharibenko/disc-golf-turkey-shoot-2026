import { DISTANCES, THROWS_PER_ROUND, pointsForOutcome, type EventState, type ThrowOutcome } from "../live-store";

// Names verified on PDGA world rankings and tournament results; all scores are simulated.
const NAMES = ["Gannon Buhr", "Richard Wysocki", "Calvin Heimburg", "Isaac Robinson", "Niklas Anttila", "Paul McBeth", "Eveliina Salonen", "Silva Saarinen", "Ohn Scoggins", "Holyn Handley", "Missy Gannon"];
export const DEMO_STEP_MS = 2000;
export const DEMO_SCORING_STEPS = NAMES.length * (THROWS_PER_ROUND - 1);
export const DEMO_CYCLE_STEPS = DEMO_SCORING_STEPS + 6;

// Deterministic snapshots keep server rendering stable and make every cycle replayable.
export function demoSnapshot(tick: number): EventState {
  const cycle = Math.floor(tick / DEMO_CYCLE_STEPS);
  const step = tick % DEMO_CYCLE_STEPS;
  const complete = step >= DEMO_SCORING_STEPS;
  const timestamp = (offset: number) => new Date(Date.UTC(2026, 10, 1) + (cycle * 1000 + offset) * DEMO_STEP_MS).toISOString();
  return {
    revision: tick,
    status: complete ? "complete" : "live",
    completedAt: complete ? timestamp(DEMO_SCORING_STEPS) : null,
    participants: NAMES.map((name, index) => {
      const count = Math.min(THROWS_PER_ROUND, 1 + Math.floor((step + NAMES.length - 1 - index) / NAMES.length));
      return {
        id: `demo-${index}`,
        name,
        email: `player-${index}@example.invalid`,
        joinedAt: timestamp(index),
        completedAt: count === THROWS_PER_ROUND ? timestamp((THROWS_PER_ROUND - 2) * NAMES.length + index + 1) : null,
        throws: Array.from({ length: THROWS_PER_ROUND }, (_, throwIndex) => {
          if (throwIndex >= count) return null;
          const seed = (index * 17 + throwIndex * 29 + cycle * 13) % 100;
          const distance = DISTANCES[(index + throwIndex + cycle) % DISTANCES.length];
          const outcome: ThrowOutcome = seed < 14 ? "Ace" : seed < 76 || throwIndex === 0 ? "Circle" : "Miss";
          return { distance, outcome, points: pointsForOutcome(distance, outcome) };
        }),
      };
    }),
  };
}
