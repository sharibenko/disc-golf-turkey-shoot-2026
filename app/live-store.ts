export const DISTANCES = [150, 225, 300, 350, 400] as const;
export type Distance = (typeof DISTANCES)[number];
export const POINTS: Record<Distance, number> = { 150: 5, 225: 10, 300: 15, 350: 20, 400: 25 };
export type ThrowOutcome = "Miss" | "Circle" | "Ace";
export type ThrowResult = { distance: Distance; outcome: ThrowOutcome; points: number; acePayout?: number };
export type Participant = {
  id: string;
  name: string;
  joinedAt: string;
  throws: (ThrowResult | null)[];
  aceWon?: number;
};
export type EventState = { participants: Participant[]; acePot: number; lastAceWinner?: string; revision: number };

export const CHANNEL_NAME = "turkey-shoot-updates";
export const EMPTY_EVENT: EventState = { participants: [], acePot: 0, revision: 0 };

export function totalPoints(participant: Participant) {
  return participant.throws.reduce<number>((sum, item) => sum + (item?.points || 0), 0);
}
