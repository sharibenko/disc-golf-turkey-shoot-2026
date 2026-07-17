import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports the scoring desk for static hosting", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Disc Golf Turkey Shoot/);
  assert.match(html, /Disc Golf Turkey Shoot/);
  assert.match(html, /Live scoring desk/);
  assert.match(html, /Signup queue/);
});

test("exports the live leaderboard route", async () => {
  const html = await readFile(new URL("../out/display/index.html", import.meta.url), "utf8");
  assert.match(html, /Live division leaderboard/);
  assert.match(html, /Leaderboard/);
  assert.match(html, /ROLLING ACE POT/);
});

test("ships the Google Sheets client instead of browser event storage", async () => {
  const [page, display, api] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/display/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sheets-api.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /localStorage/);
  assert.doesNotMatch(display, /localStorage/);
  assert.match(api, /NEXT_PUBLIC_SHEETS_API_URL/);
  assert.match(api, /expectedRevision/);
});
