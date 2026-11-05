import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

test("name-only rounds stay linked while identical names stay separate", async () => {
  const source = await readFile(new URL("../app/live-store.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { bestRounds, roundNumber } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  const round = (id, playerId, points, joinedAt, email = "") => ({ id, playerId, name: "Same Name", email, joinedAt, completedAt: null, throws: [{distance:200,outcome:"Circle",points},null,null,null,null,null] });
  const a = round("a", "player-a", 100, "2026-01-01");
  const b = round("b", "player-a", 200, "2026-01-02");
  const c = round("c", "player-b", 100, "2026-01-03");
  const rounds = [a,b,c];
  assert.equal(roundNumber(b,rounds),2);
  assert.equal(roundNumber(c,rounds),1);
  assert.deepEqual(bestRounds(rounds).map(p=>p.id),["b","c"]);
  const old = [round("d",undefined,100,"2026-01-01","TEST@EXAMPLE.COM"),round("e",undefined,200,"2026-01-02","test@example.com")];
  assert.equal(bestRounds(old).length,1);
  assert.equal(roundNumber(old[1],old),2);
  const ctx=vm.createContext({});
  vm.runInContext(await readFile(new URL("../google-apps-script/Code.gs",import.meta.url),"utf8"),ctx);
  const saved=ctx.sanitizeEvent_({participants:rounds});
  assert.equal(saved.participants.length,3);
  assert.equal(saved.participants[1].playerId,"player-a");
  assert.equal(saved.participants[1].email,"");
});
