import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("saving a corrected completed round overwrites its existing throw and Sheets state", async () => {
  const context = vm.createContext({});
  vm.runInContext(await readFile(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8"), context);
  const original = { participants: [{ id: "round-1", name: "Test", email: "test@example.invalid", joinedAt: "2026-10-29", completedAt: "2026-10-29", throws: Array.from({ length: 6 }, () => ({ distance: 200, outcome: "Circle", points: 100 })) }], revision: 3, status: "live", completedAt: null };
  let stored = structuredClone(original);
  context.readState_ = () => structuredClone(stored);
  context.writeState_ = (event) => { stored = structuredClone(event); };
  context.getRequiredProperty_ = () => "test-pin";
  context.json_ = (value) => value;
  context.LockService = { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) };
  const corrected = structuredClone(original);
  corrected.participants[0].throws[1] = { distance: "long-snood", outcome: "Ace", points: 1200 };
  const response = context.doPost({ postData: { contents: JSON.stringify({ action: "save", pin: "test-pin", expectedRevision: 3, event: corrected }) } });
  assert.equal(response.ok, true);
  assert.equal(stored.revision, 4);
  assert.equal(stored.participants.length, 1);
  assert.equal(stored.participants[0].id, "round-1");
  assert.equal(stored.participants[0].throws.length, 6);
  assert.equal(stored.participants[0].throws[1].points, 1200);
  assert.equal(stored.participants[0].throws.reduce((sum, item) => sum + item.points, 0), 1700);
  assert.equal(stored.participants[0].completedAt, original.participants[0].completedAt);
  for (const index of [0, 2, 3, 4, 5]) assert.equal(stored.participants[0].throws[index].points, 100);
});

test("scoring desk and Sheets agree on every basket and outcome", async () => {
  const source = await readFile(new URL("../app/live-store.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { DISTANCES, pointsForOutcome, distanceLabel } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  const context = vm.createContext({});
  vm.runInContext(await readFile(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8"), context);
  const expected = [[200, 100], [280, 200], [350, 300], ["long-snood", 600]];
  assert.deepEqual(DISTANCES, expected.map(([distance]) => distance));
  assert.equal(distanceLabel("long-snood"), "SNOOD");
  for (const [distance, points] of expected) {
    for (const [outcome, multiplier] of [["Miss", 0], ["Circle", 1], ["Ace", 2]]) {
      assert.equal(pointsForOutcome(distance, outcome), points * multiplier);
      const result = context.sanitizeEvent_({ participants: [{ id: "test", name: "Test", email: "test@example.invalid", throws: [{ distance, outcome, points: -1 }] }] });
      assert.equal(result.participants[0].throws[0].distance, distance);
      assert.equal(result.participants[0].throws[0].points, points * multiplier);
    }
  }
});
