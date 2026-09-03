export const DISTANCES = [200, 250, 300, 350] as const;
export const THROWS_PER_ROUND = 6;
export type Distance = (typeof DISTANCES)[number];
export const POINTS: Record<Distance, number> = { 200: 100, 250: 200, 300: 300, 350: 400 };
export type ThrowOutcome = "Miss" | "Circle" | "Ace";
export type ThrowResult = { distance: Distance; outcome: ThrowOutcome; points: number };
export type Participant = {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  completedAt: string | null;
  throws: (ThrowResult | null)[];
};
export type EventState = {
  participants: Participant[];
  revision: number;
  status: "live" | "complete";
  completedAt: string | null;
};

export const CHANNEL_NAME = "turkey-shoot-updates";
export const EMPTY_EVENT: EventState = { participants: [], revision: 0, status: "live", completedAt: null };

export function pointsForOutcome(distance: Distance, outcome: ThrowOutcome) {
  if (outcome === "Miss") return 0;
  return POINTS[distance] * (outcome === "Ace" ? 2 : 1);
}

export function totalPoints(participant: Participant) {
  return participant.throws.reduce<number>((sum, item) => sum + (item?.points || 0), 0);
}

export function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLocaleLowerCase();
}

export function bestRounds(participants: Participant[]) {
  const bestByEmail = new Map<string, Participant>();
  participants.filter((person) => person.throws.some(Boolean)).forEach((person) => {
    const key = normalizeEmail(person.email) || `legacy:${person.id}`;
    const current = bestByEmail.get(key);
    if (!current || totalPoints(person) > totalPoints(current) || (totalPoints(person) === totalPoints(current) && person.joinedAt < current.joinedAt)) {
      bestByEmail.set(key, person);
    }
  });
  return [...bestByEmail.values()].sort((a, b) => totalPoints(b) - totalPoints(a) || a.joinedAt.localeCompare(b.joinedAt));
}

export function roundNumber(participant: Participant, participants: Participant[]) {
  const email = normalizeEmail(participant.email);
  return participants
    .filter((person) => normalizeEmail(person.email) === email)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
    .findIndex((person) => person.id === participant.id) + 1;
}
