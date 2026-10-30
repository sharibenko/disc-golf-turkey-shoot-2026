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
  assert.match(store, /DISTANCES = \[200, 280, 350, "long-snood"\]/);
  assert.match(store, /200: 100, 280: 200, 350: 300, "long-snood": 600/);
  assert.match(store, /outcome === "Ace" \? 2 : 1/);
  assert.match(store, /THROWS_PER_ROUND = 6/);
  assert.match(store, /bestRounds/);
  assert.match(appsScript, /distances = \[200, 280, 350, "long-snood"\]/);
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
  assert.match(page, /Edit round throws/);
  assert.match(page, /Edit throw/);
  assert.match(page, /participants: \[participant, \.\.\.event\.participants\]/);
  assert.match(page, /signupNumberById/);
  assert.match(page, /completedAt/);
  assert.match(page, /status: "complete"/);
  const view = await readFile(new URL("../app/leaderboard-view.tsx", import.meta.url), "utf8");
  assert.match(view, /podiumPlace/);
  assert.match(api, /NEXT_PUBLIC_SHEETS_API_URL/);
  assert.match(api, /expectedRevision/);
});

test("each division awards at most three distinct podium places, including tied scores", async () => {
  const ts = await import("typescript");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const compile = (source, resolve) => {
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const exports = {};
    new Function("require", "exports", output)(resolve, exports);
    return exports;
  };
  const store = compile(await readFile(new URL("../app/live-store.ts", import.meta.url), "utf8"), require);
  const { LeaderboardView } = compile(await readFile(new URL("../app/leaderboard-view.tsx", import.meta.url), "utf8"), (name) => {
    if (name === "./live-store") return store;
    if (name === "next/image") return () => null;
    return require(name);
  });
  for (const count of [3, 6, 18]) {
    const participants = Array.from({ length: count }, (_, index) => ({
      id: String(index), name: `Player ${index}`, email: `${index}@example.invalid`,
      joinedAt: new Date(2026, 0, 1, 0, index).toISOString(), completedAt: null,
      throws: [{ distance: 200, outcome: "Circle", points: 100 }, null, null, null, null, null],
    }));
    for (const status of ["live", "complete"]) {
      const html = renderToStaticMarkup(React.createElement(LeaderboardView, { event: { participants, status, revision: 0, completedAt: null } }));
      const divisions = [...html.matchAll(/<section id="division-[\s\S]*?<\/section>/g)];
      assert.equal(divisions.length, 3);
      for (const [divisionIndex, [section]] of divisions.entries()) {
        const places = [...section.matchAll(/<span class="place">(\d+)<\/span>/g)].map((match) => match[1]);
        assert.deepEqual(places, Array.from({ length: count / 3 }, (_, index) => String(index + 1).padStart(2, "0")).slice(3));
        const badges = [...section.matchAll(/<em class="podium-ribbon" aria-label="([^"]+)"/g)].map((match) => match[1]);
        assert.deepEqual(badges, ["1st", "2nd", "3rd"].slice(0, count / 3).map((place) => `${status === "live" ? "Current " : ""}${place} place`));
        assert.match(section, new RegExp(`Player ${divisionIndex * count / 3}</span>`));
      }
    }
  }
});

test("exports a populated demo without using the live event connection", async () => {
  const html = await readFile(new URL("../out/demo/index.html", import.meta.url), "utf8");
  assert.match(html, /Simulated scores/);
  assert.match(html, /Gannon Buhr/);
  assert.match(html, /Demo scoring/);
  const demo = await readFile(new URL("../app/demo/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(demo, /fetchEvent|BroadcastChannel|sheets-api/);
});

test("demo cycles through valid six-throw events and restarts with fresh scores", async () => {
  const ts = await import("typescript");
  const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const storeSource = await readFile(new URL("../app/live-store.ts", import.meta.url), "utf8");
  const storeUrl = moduleUrl(compile(storeSource));
  const source = await readFile(new URL("../app/demo/simulation.ts", import.meta.url), "utf8");
  const { demoSnapshot, DEMO_SCORING_STEPS, DEMO_CYCLE_STEPS } = await import(moduleUrl(compile(source).replace('"../live-store"', JSON.stringify(storeUrl))));
  const { pointsForOutcome, bestRounds } = await import(storeUrl);
  const initial = demoSnapshot(0);
  assert.equal(bestRounds(initial.participants).length, 11);
  let previousThrows = 11;
  for (let tick = 1; tick <= DEMO_SCORING_STEPS; tick++) {
    const event = demoSnapshot(tick);
    const throws = event.participants.flatMap((person) => person.throws).filter(Boolean);
    assert.equal(throws.length, previousThrows + 1);
    previousThrows = throws.length;
    for (const result of throws) assert.equal(result.points, pointsForOutcome(result.distance, result.outcome));
  }
  const final = demoSnapshot(DEMO_SCORING_STEPS);
  assert.equal(final.status, "complete");
  assert.ok(final.participants.every((person) => person.completedAt && person.throws.every(Boolean)));
  assert.equal(demoSnapshot(DEMO_CYCLE_STEPS - 1).status, "complete");
  const restarted = demoSnapshot(DEMO_CYCLE_STEPS);
  assert.equal(restarted.status, "live");
  assert.ok(restarted.participants.every((person) => person.throws.filter(Boolean).length === 1));
  assert.notDeepEqual(restarted.participants[0].throws, initial.participants[0].throws);
});
