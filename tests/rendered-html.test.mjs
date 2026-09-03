import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports the scoring desk for static hosting", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Turkey Target Challenge 2026/);
  assert.match(html, /Turkey Target Challenge 2026/);
  assert.match(html, /Live scoring desk/);
  assert.match(html, /End Event/);
});

test("exports the live leaderboard route", async () => {
  const html = await readFile(new URL("../out/display/index.html", import.meta.url), "utf8");
  assert.match(html, /Live scoring/);
  assert.doesNotMatch(html, /<h1>Leaderboard/);
  assert.match(html, /Circle hit scoring/);
  assert.doesNotMatch(html, /ROLLING ACE POT/);
});

test("uses the current event distances and scoring values", async () => {
  const [store, appsScript] = await Promise.all([
    readFile(new URL("../app/live-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8"),
  ]);
  assert.match(store, /DISTANCES = \[200, 250, 300, 350\]/);
  assert.match(store, /200: 100, 250: 200, 300: 300, 350: 400/);
  assert.match(store, /outcome === "Ace" \? 2 : 1/);
  assert.match(store, /THROWS_PER_ROUND = 6/);
  assert.match(store, /bestRounds/);
  assert.match(appsScript, /distances = \[200, 250, 300, 350\]/);
  assert.match(appsScript, /item\.outcome === "Ace" \? 2 : 1/);
  assert.match(appsScript, /length: 6/);
});

test("ships the Google Sheets client instead of browser event storage", async () => {
  const [page, display, api] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/display/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sheets-api.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /localStorage/);
  assert.doesNotMatch(display, /localStorage/);
  assert.match(page, /Search players/);
  assert.match(page, /name="email"/);
  assert.match(page, /bestRounds/);
  assert.match(page, /Show players/);
  assert.match(page, /All players/);
  assert.match(page, /Active rounds/);
  assert.match(page, /Finished rounds/);
  assert.doesNotMatch(page, /Sort queue/);
  assert.match(page, /Start another round/);
  assert.match(page, /Show all players/);
  assert.match(page, /Edit Scores/);
  assert.match(page, /Delete throw/);
  assert.match(page, /participants: \[participant, \.\.\.event\.participants\]/);
  assert.match(page, /signupNumberById/);
  assert.match(page, /completedAt/);
  assert.match(page, /status: "complete"/);
  assert.match(display, /isFinal \? "Winner" : "Current winner"/);
  assert.match(api, /NEXT_PUBLIC_SHEETS_API_URL/);
  assert.match(api, /expectedRevision/);
});
