import { EMPTY_EVENT, normalizeEmail, THROWS_PER_ROUND, type EventState, type Participant } from "./live-store";

const API_URL = process.env.NEXT_PUBLIC_SHEETS_API_URL?.trim();

export class SheetsApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

function endpoint(query = "") {
  if (!API_URL) {
    throw new SheetsApiError(
      "This site has not been connected to its Google Sheet yet.",
      "NOT_CONFIGURED",
    );
  }
  return `${API_URL}${query}${query ? "&" : "?"}t=${Date.now()}`;
}

function normalizeEvent(value: unknown): EventState {
  const event = value as Partial<EventState> | null;
  if (!event || !Array.isArray(event.participants)) {
    return EMPTY_EVENT;
  }
  const status = event.status === "complete" ? "complete" : "live";
  return {
    participants: event.participants.map((value) => {
      const participant = value as Participant;
      return {
        ...participant,
        email: normalizeEmail(participant.email),
        throws: Array.from({ length: THROWS_PER_ROUND }, (_, index) => participant.throws?.[index] || null),
      };
    }),
    revision: Number(event.revision) || 0,
    status,
    completedAt: status === "complete" && event.completedAt ? String(event.completedAt) : null,
  };
}

export async function fetchEvent(signal?: AbortSignal): Promise<EventState> {
  const response = await fetch(endpoint("?action=state"), { cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new SheetsApiError(payload.error || "Could not load event data.", payload.code);
  }
  return normalizeEvent(payload.event);
}

export async function saveEvent(next: EventState, pin: string): Promise<EventState> {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "save", pin, expectedRevision: next.revision, event: next }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new SheetsApiError(payload.error || "Could not save event data.", payload.code);
  }
  return normalizeEvent(payload.event);
}

export function apiIsConfigured() {
  return Boolean(API_URL);
}
