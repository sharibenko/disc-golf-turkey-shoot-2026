export const DISTANCES = [200, 250, 300, 350] as const;
export type Distance = (typeof DISTANCES)[number];
export const POINTS: Record<Distance, number> = { 200: 100, 250: 200, 300: 300, 350: 400 };
export type ThrowOutcome = "Miss" | "Circle" | "Ace";
export type ThrowResult = { distance: Distance; outcome: ThrowOutcome; points: number };
export type Participant = {
  id: string;
  name: string;
  joinedAt: string;
  completedAt: string | null;
  throws: (ThrowResult | null)[];
};
export type EventState = { participants: Participant[]; revision: number };

export const CHANNEL_NAME = "turkey-shoot-updates";
export const EMPTY_EVENT: EventState = { participants: [], revision: 0 };

export function pointsForOutcome(distance: Distance, outcome: ThrowOutcome) {
  if (outcome === "Miss") return 0;
  return POINTS[distance] * (outcome === "Ace" ? 2 : 1);
}

export function totalPoints(participant: Participant) {
  return participant.throws.reduce<number>((sum, item) => sum + (item?.points || 0), 0);
}
