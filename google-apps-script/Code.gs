const SHEETS = {
  state: "State",
  event: "Event",
  participants: "Participants",
  throws: "Throws",
};

function doGet() {
  try {
    return json_({ ok: true, event: readState_() });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error), code: "READ_FAILED" });
  }
}

function doPost(request) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((request.postData && request.postData.contents) || "{}");
    if (!safeEqual_(String(body.pin || ""), getRequiredProperty_("ADMIN_PIN"))) {
      return json_({ ok: false, error: "The event admin PIN is incorrect.", code: "UNAUTHORIZED" });
    }
    if (body.action !== "save" || !body.event) {
      return json_({ ok: false, error: "Unsupported request.", code: "BAD_REQUEST" });
    }

    lock.waitLock(10000);
    const current = readState_();
    if (Number(body.expectedRevision) !== Number(current.revision)) {
      return json_({
        ok: false,
        error: "Someone else updated the event. The latest scores have been reloaded; please try again.",
        code: "REVISION_CONFLICT",
        event: current,
      });
    }

    const next = sanitizeEvent_(body.event);
    const isReset = next.status === "live" && next.participants.length === 0;
    if (current.status === "complete" && !isReset) {
      return json_({ ok: false, error: "Scoring is complete. Reset the event before recording new results.", code: "EVENT_COMPLETE", event: current });
    }
    next.revision = current.revision + 1;
    writeState_(next);
    return json_({ ok: true, event: next });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error), code: "WRITE_FAILED" });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function setupTurkeyShoot() {
  const spreadsheet = spreadsheet_();
  Object.values(SHEETS).forEach((name) => {
    if (!spreadsheet.getSheetByName(name)) spreadsheet.insertSheet(name);
  });
  writeState_({ participants: [], revision: 0, status: "live", completedAt: null });
}

function readState_() {
  const sheet = getOrCreateSheet_(SHEETS.state);
  const raw = sheet.getRange("A2").getValue();
  if (!raw) return { participants: [], revision: 0, status: "live", completedAt: null };
  return sanitizeEvent_(JSON.parse(String(raw)));
}

function writeState_(event) {
  const spreadsheet = spreadsheet_();
  const stateSheet = getOrCreateSheet_(SHEETS.state);
  stateSheet.clearContents();
  stateSheet.getRange(1, 1, 2, 2).setValues([
    ["Event state JSON", "Updated at"],
    [JSON.stringify(event), new Date()],
  ]);
  stateSheet.setFrozenRows(1);

  writeTable_(spreadsheet, SHEETS.event,
    ["Revision", "Status", "Scoring completed at", "Updated at"],
    [[event.revision, event.status, event.completedAt || "", new Date()]]);

  const participants = event.participants.map((person) => [
    person.id, person.name, person.joinedAt, person.completedAt || "",
    person.throws.filter(Boolean).length,
    person.throws.reduce((sum, item) => sum + (item ? item.points : 0), 0),
  ]);
  writeTable_(spreadsheet, SHEETS.participants,
    ["Participant ID", "Name", "Signup time", "Completion time", "Throws recorded", "Total points"],
    participants);

  const throws = [];
  event.participants.forEach((person) => {
    person.throws.forEach((item, index) => {
      if (item) throws.push([
        person.id, person.name, index + 1, item.distance, item.outcome,
        item.points,
      ]);
    });
  });
  writeTable_(spreadsheet, SHEETS.throws,
    ["Participant ID", "Participant", "Throw", "Distance (ft)", "Outcome", "Points"],
    throws);
}

function writeTable_(spreadsheet, name, headers, rows) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function sanitizeEvent_(input) {
  const distances = [200, 250, 300, 350];
  const pointsByDistance = { 200: 100, 250: 200, 300: 300, 350: 400 };
  const outcomes = ["Miss", "Circle", "Ace"];
  const participants = Array.isArray(input.participants) ? input.participants.map((person) => ({
    id: String(person.id || ""),
    name: String(person.name || "").slice(0, 100),
    joinedAt: String(person.joinedAt || ""),
    completedAt: person.completedAt ? String(person.completedAt) : null,
    throws: Array.from({ length: 10 }, (_, index) => {
      const item = Array.isArray(person.throws) ? person.throws[index] : null;
      if (!item || distances.indexOf(Number(item.distance)) < 0 || outcomes.indexOf(item.outcome) < 0) return null;
      return {
        distance: Number(item.distance),
        outcome: item.outcome,
        points: item.outcome === "Miss" ? 0 : pointsByDistance[Number(item.distance)] * (item.outcome === "Ace" ? 2 : 1),
      };
    }),
  })).filter((person) => person.id && person.name) : [];

  return {
    participants,
    revision: Math.max(0, Number(input.revision) || 0),
    status: input.status === "complete" ? "complete" : "live",
    completedAt: input.status === "complete" && input.completedAt ? String(input.completedAt) : null,
  };
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error("Set the SPREADSHEET_ID script property before deploying.");
  return active;
}

function getOrCreateSheet_(name) {
  const spreadsheet = spreadsheet_();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Missing required script property: ${name}`);
  return value;
}

function safeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
