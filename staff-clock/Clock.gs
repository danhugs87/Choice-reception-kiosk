/** Staff clock: authenticated RPC, paid time and recoverable clock actions. */
var SC_LOCATIONS = ["Choice building", "Working from home", "Off-site work"];
var SC_OPERATION_HEADERS = ["Request ID", "Staff ID", "Action", "Requested at", "Intent JSON", "Status", "Result"];

function setupStaffClockApp() {
  var owner = scPinOwner_();
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("STAFF_BREAK_POLICY") !== "PAID_NO_DEDUCTION") throw new Error("Check the paid-break setup first.");
    Object.keys(SC_HEADERS).forEach(function(name) { scValidateHeaders_(owner.ss.getSheetByName(name), SC_HEADERS[name]); });
    var accounts = scPinAccounts_(owner.ss);
    accounts.filter(function(a) { return a.enabled; }).forEach(function(a) {
      scParsePinRecord_(properties.getProperty("STAFF_PIN_" + a.id));
    });
    var sheet = owner.ss.getSheetByName("Operations");
    if (sheet && sheet.getLastRow()) scValidateHeaders_(sheet, SC_OPERATION_HEADERS);
    else {
      if (!sheet) sheet = owner.ss.insertSheet("Operations");
      sheet.getRange(1, 1, 1, 7).setValues([SC_OPERATION_HEADERS]);
      sheet.getRange(1, 1, 1, 7).setBackground("#286247").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1); sheet.setColumnWidths(1, 7, 200);
      sheet.getRange("D:D").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    }
    SpreadsheetApp.flush();
    console.log("Staff clock test app ready. Existing records and PINs were preserved. Deploy the staff project as a NEW web app.");
  } finally { lock.releaseLock(); }
}

function doGet() {
  var live = !!PropertiesService.getScriptProperties().getProperty("STAFF_LIVE_PREPARED_AT");
  var output = HtmlService.createHtmlOutputFromFile("Staff");
  if (live) output.setContent(output.getContent().replace("TEST SYSTEM · Choice staff timekeeping", "Choice staff timekeeping"));
  return output.setTitle(live ? "Choice Staff Clock" : "Choice Staff Clock - Test")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function staffClockRequest(request) {
  var lock;
  try {
    if (!request || typeof request.action !== "string") throw new Error("Request not recognised.");
    var properties = PropertiesService.getScriptProperties();
    var id = properties.getProperty("STAFF_SPREADSHEET_ID");
    if (!id) throw new Error("Staff setup has not been completed.");
    var ss = SpreadsheetApp.openById(id);
    var gate = scStaffLogGate_(properties, request); if (gate) return gate;
    if (request.action === "listStaff") {
      return {status: "success", generation: properties.getProperty("STAFF_DATA_GENERATION") || "test", staff: scPinAccounts_(ss).filter(function(a) { return a.enabled; })
        .map(function(a) { return {id: a.id, name: a.name}; })};
    }
    var verified = scVerifyPin_(request.staffId, request.pin);
    if (!verified.ok) return {status: "error", code: "AUTH", message: verified.message};
    lock = LockService.getScriptLock(); lock.waitLock(10000);
    gate = scStaffLogGate_(properties, request); if (gate) return gate;
    // Recheck role, enabled flag and PIN version after acquiring the action lock.
    var actor = scPinAccounts_(ss).filter(function(a) { return a.id === verified.staffId && a.enabled; })[0];
    var record = scParsePinRecord_(properties.getProperty("STAFF_PIN_" + verified.staffId));
    if (!actor || record.version !== verified.pinVersion) return {status: "error", code: "AUTH", message: "Please sign in again."};
    if (request.action === "changePin") {
      if (typeof request.newPin !== "string" || !/^[0-9]{6}$/.test(request.newPin)) scFail_("Choose a six-digit PIN.");
      var pepper = properties.getProperty("STAFF_PIN_PEPPER");
      var used = scPinAccounts_(ss).some(function(a) {
        var raw = properties.getProperty("STAFF_PIN_" + a.id);
        if (!raw) return false;
        var p = scParsePinRecord_(raw);
        return scEqualPinHash_(p.hash, scPinHash_(a.id, request.newPin, p.salt, pepper));
      });
      if (used || /^(\d)\1{5}$/.test(request.newPin) || request.newPin === "123456" || request.newPin === "654321") {
        scFail_("Choose a different PIN; that code is too simple or already in use.");
      }
      scStorePin_(actor.id, request.newPin, actor.id, properties, pepper, false);
      return {status: "success", message: "PIN changed. Sign in using your new PIN."};
    }
    var profile = {id: actor.id, name: actor.name, role: actor.role};
    if (record.mustChange) {
      if (request.action !== "login") return {status: "error", code: "CHANGE_PIN", message: "Change your initial PIN first."};
      return {status: "success", mustChange: true, profile: profile};
    }
    scClockTables_(ss);
    if (["managementOpenShifts", "closeMissedShift"].indexOf(request.action) !== -1) {
      if (actor.role !== "Management") scFail_("Management access is required.");
      return scStaffCorrectionRequest_(ss, actor, request);
    }
    if (request.action === "managementWeek") {
      if (actor.role !== "Management") scFail_("Management access is required.");
      var week = scWeekBounds_(request.weekDate, new Date());
      return {status: "success", week: week.label, summary: scPinAccounts_(ss).map(function(a) {
        var data = scWeekReport_(ss, a.id, week);
        return {name: a.name, role: a.role, recordedHours: data.recordedHours,
          ongoingHours: data.ongoingHours, recordedMinutes: data.recordedMinutes, ongoingMinutes: data.ongoingMinutes, pending: scPendingOperations_(ss, a.id).length > 0 || (typeof scHasPendingStaffCorrection_ === "function" && scHasPendingStaffCorrection_(ss, a.id))};
      })};
    }
    if (typeof scRecoverStaffCorrections_ === "function") scRecoverStaffCorrections_(ss, actor.id);
    scRecoverPending_(ss, actor.id);
    if (["clockIn", "clockOut", "changeLocation"].indexOf(request.action) !== -1) scClockAction_(ss, actor.id, request);
    else if (["login", "getState"].indexOf(request.action) === -1) scFail_("Action not recognised.");
    var state = scWorkingState_(ss, actor.id);
    return {status: "success", profile: profile, state: state, locations: SC_LOCATIONS,
      week: scWeekReport_(ss, actor.id, scWeekBounds_(request.weekDate, new Date()))};
  } catch (error) {
    // Only deliberate business messages are returned; no raw request/credentials.
    var message = error && error.scBusiness ? error.message : "Unable to confirm the action. Retry the same action or sign in again to recover it. Ask management if it continues.";
    return {status: "error", message: message};
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

// Check before reads and again under the action lock: interrupted preparation
// stays closed, and a page loaded before go-live cannot replay a test action.
function scStaffLogGate_(properties, request) {
  var raw = properties.getProperty("STAFF_GO_LIVE_CHECKPOINT");
  if (raw) {
    var checkpoint;
    try { checkpoint = JSON.parse(raw); } catch (_) { checkpoint = {}; }
    if (checkpoint.phase !== "complete" || !properties.getProperty("STAFF_LIVE_PREPARED_AT")) {
      return {status: "error", code: "MAINTENANCE", message: "Staff timekeeping is being prepared. Please wait and ask management before clocking."};
    }
  }
  if (request.action !== "listStaff" && properties.getProperty("STAFF_LIVE_PREPARED_AT") &&
      (!properties.getProperty("STAFF_DATA_GENERATION") || request.generation !== properties.getProperty("STAFF_DATA_GENERATION"))) {
    return {status: "error", code: "STALE_LOG", message: "The staff log has been updated. Reload this page before signing in or clocking."};
  }
  return null;
}

function scFail_(message) { var error = new Error(message); error.scBusiness = true; throw error; }
function scClockTables_(ss) {
  ["Shifts", "Work_Segments"].forEach(function(name) { scValidateHeaders_(ss.getSheetByName(name), SC_HEADERS[name]); });
  scValidateHeaders_(ss.getSheetByName("Operations"), SC_OPERATION_HEADERS);
}
function scRows_(ss, name) { return ss.getSheetByName(name).getDataRange().getValues(); }
function scFindRow_(rows, id) {
  var found = [];
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === id) found.push(i);
  if (found.length > 1) scFail_("Duplicate record reference. Ask management to review it.");
  return found.length ? found[0] : -1;
}
function scWorkingState_(ss, id) {
  var shifts = scRows_(ss, "Shifts").slice(1).filter(function(r) { return r[1] === id && r[4] === "Open" && !r[3]; });
  var segments = scRows_(ss, "Work_Segments").slice(1).filter(function(r) { return r[2] === id && !r[5]; });
  if (shifts.length > 1 || segments.length > 1 || shifts.length !== segments.length ||
      (shifts.length && shifts[0][0] !== segments[0][1])) scFail_("Time records need management review before another action.");
  if (!shifts.length) return {working: false};
  return {working: true, shiftId: shifts[0][0], segmentId: segments[0][0],
    clockIn: scDisplayTime_(shifts[0][2]), location: segments[0][3],
    locationStart: scDisplayTime_(segments[0][4]), note: scDisplayText_(segments[0][6]),
    longOpenShift: new Date().getTime() - shifts[0][2].getTime() > 18 * 3600000};
}
function scPendingOperations_(ss, id) {
  return scRows_(ss, "Operations").slice(1).filter(function(r) { return r[1] === id && r[5] === "Pending"; });
}
function scRecoverPending_(ss, id) {
  var pending = scPendingOperations_(ss, id);
  if (pending.length > 1) scFail_("More than one unfinished action needs management review.");
  if (pending.length) scApplyClockIntent_(ss, JSON.parse(pending[0][4]));
}
function scClockAction_(ss, id, request) {
  if (typeof request.requestId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(request.requestId)) scFail_("Return to the clock screen and try again.");
  var location = request.action === "clockOut" ? "" : request.location;
  var note = request.action === "clockOut" ? "" : scCleanClockText_(request.note || "", 200);
  if (request.action !== "clockOut" && SC_LOCATIONS.indexOf(location) === -1) scFail_("Choose a work location.");
  if (location === "Off-site work" && !note) scFail_("Add a short description of the off-site work.");
  var operations = scRows_(ss, "Operations");
  var existing = scFindRow_(operations, request.requestId);
  if (existing !== -1) {
    var saved = JSON.parse(operations[existing][4]);
    if (saved.staffId !== id || saved.action !== request.action || saved.location !== location || saved.note !== note) scFail_("This action reference was already used. Sign in again.");
    if (operations[existing][5] !== "Applied") scApplyClockIntent_(ss, saved);
    return;
  }
  var state = scWorkingState_(ss, id);
  if (request.action === "clockIn" && state.working) scFail_("You are already clocked in. Use Change location or Clock out.");
  if (request.action !== "clockIn" && !state.working) scFail_("You are already clocked out.");
  if (request.action === "changeLocation" && state.location === location && state.note === note) scFail_("You are already recorded at that location with those details.");
  var intent = {requestId: request.requestId, staffId: id, action: request.action,
    at: new Date().toISOString(), location: location, note: note,
    shiftId: state.working ? state.shiftId : Utilities.getUuid(),
    oldSegmentId: state.working ? state.segmentId : "", newSegmentId: request.action !== "clockOut" ? Utilities.getUuid() : ""};
  ss.getSheetByName("Operations").appendRow([intent.requestId, id, intent.action, new Date(intent.at), JSON.stringify(intent), "Pending", ""]);
  SpreadsheetApp.flush();
  scApplyClockIntent_(ss, intent);
}

function scApplyClockIntent_(ss, intent) {
  var opRows = scRows_(ss, "Operations"), opIndex = scFindRow_(opRows, intent.requestId);
  if (opIndex < 1 || opRows[opIndex][1] !== intent.staffId || opRows[opIndex][2] !== intent.action) scFail_("Unfinished action needs management review.");
  if (opRows[opIndex][5] === "Applied") return;
  var at = new Date(intent.at), shifts = scRows_(ss, "Shifts"), shiftIndex = scFindRow_(shifts, intent.shiftId);
  if (isNaN(at.getTime())) scFail_("Invalid recorded action time. Ask management.");
  if (intent.action === "clockIn") {
    if (shiftIndex === -1) {
      if (shifts.slice(1).some(function(r) { return r[1] === intent.staffId && r[4] === "Open"; })) scFail_("Another shift is already open. Ask management.");
      ss.getSheetByName("Shifts").appendRow([intent.shiftId, intent.staffId, at, "", "Open", intent.requestId, ""]);
    } else if (shifts[shiftIndex][1] !== intent.staffId || shifts[shiftIndex][5] !== intent.requestId ||
        shifts[shiftIndex][2].getTime() !== at.getTime() || shifts[shiftIndex][4] !== "Open") scFail_("The unfinished clock-in needs management review.");
    scEnsureNewSegment_(ss, intent, at);
  } else {
    if (shiftIndex < 1 || shifts[shiftIndex][1] !== intent.staffId) scFail_("The shift needs management review.");
    var shift = shifts[shiftIndex];
    if (at.getTime() < shift[2].getTime()) scFail_("Clock action time precedes the shift start.");
    if (shift[3] && !(intent.action === "clockOut" && shift[6] === intent.requestId && shift[3].getTime() === at.getTime())) scFail_("This shift has already been closed differently.");
    scCloseClockSegment_(ss, intent, at);
    if (intent.action === "changeLocation") scEnsureNewSegment_(ss, intent, at);
    else if (intent.action === "clockOut") {
      ss.getSheetByName("Shifts").getRange(shiftIndex + 1, 4, 1, 4).setValues([[at, "Closed", shift[5], intent.requestId]]);
    } else scFail_("Unknown unfinished action.");
  }
  SpreadsheetApp.flush();
  ss.getSheetByName("Operations").getRange(opIndex + 1, 6, 1, 2).setValues([["Applied", "Saved"]]);
  SpreadsheetApp.flush();
}
function scEnsureNewSegment_(ss, intent, at) {
  var rows = scRows_(ss, "Work_Segments"), index = scFindRow_(rows, intent.newSegmentId);
  if (index !== -1) {
    var row = rows[index];
    if (row[1] !== intent.shiftId || row[2] !== intent.staffId || row[3] !== intent.location ||
        row[4].getTime() !== at.getTime() || row[5] || scDisplayText_(row[6]) !== intent.note || row[7] !== intent.requestId) scFail_("The work location record needs management review.");
    return;
  }
  if (rows.slice(1).some(function(r) { return r[2] === intent.staffId && !r[5]; })) scFail_("Another work period is open. Ask management.");
  ss.getSheetByName("Work_Segments").appendRow([intent.newSegmentId, intent.shiftId, intent.staffId, intent.location, at, "", scClockCellText_(intent.note), intent.requestId]);
}
function scCloseClockSegment_(ss, intent, at) {
  var rows = scRows_(ss, "Work_Segments"), index = scFindRow_(rows, intent.oldSegmentId);
  if (index < 1 || rows[index][1] !== intent.shiftId || rows[index][2] !== intent.staffId || at.getTime() < rows[index][4].getTime()) scFail_("The previous work period needs management review.");
  if (rows[index][5]) {
    if (rows[index][5].getTime() !== at.getTime()) scFail_("The work period was already closed differently.");
  } else ss.getSheetByName("Work_Segments").getRange(index + 1, 6).setValue(at);
}

function scWeekBounds_(dateText, now) {
  var text = dateText || Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) scFail_("Choose a valid week date.");
  var day = new Date(text + "T00:00:00Z");
  if (isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== text) scFail_("Choose a valid week date.");
  var monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000);
  var next = new Date(monday.getTime() + 7 * 86400000);
  var start = Utilities.parseDate(monday.toISOString().slice(0, 10) + " 00:00", "Europe/London", "yyyy-MM-dd HH:mm");
  var end = Utilities.parseDate(next.toISOString().slice(0, 10) + " 00:00", "Europe/London", "yyyy-MM-dd HH:mm");
  return {start: start.getTime(), end: end.getTime(), label: Utilities.formatDate(start, "Europe/London", "dd/MM/yyyy")};
}
function scWeekReport_(ss, id, week) {
  var completed = 0, ongoing = 0, details = [], now = Date.now();
  scRows_(ss, "Work_Segments").slice(1).forEach(function(row) {
    if (row[2] !== id) return;
    if (!(row[4] instanceof Date) || (row[5] && !(row[5] instanceof Date))) scFail_("A work period has an invalid date. Ask management.");
    var start = row[4].getTime(), finish = row[5] ? row[5].getTime() : now;
    if (finish < start) scFail_("A work period ends before it starts. Ask management.");
    var elapsed = Math.max(0, Math.min(finish, week.end) - Math.max(start, week.start));
    if (!elapsed) return;
    if (row[5]) completed += elapsed; else ongoing += elapsed;
    details.push({start: scDisplayTime_(row[4]), end: row[5] ? scDisplayTime_(row[5]) : "Still open",
      location: row[3], note: scDisplayText_(row[6]), hours: Math.round(elapsed / 36000) / 100, minutes: Math.round(elapsed / 60000), open: !row[5]});
  });
  return {weekStarting: week.label, recordedHours: Math.round(completed / 36000) / 100,
    ongoingHours: Math.round(ongoing / 36000) / 100, recordedMinutes: Math.round(completed / 60000),
    ongoingMinutes: Math.round(ongoing / 60000), details: details};
}
function scDisplayTime_(date) { return Utilities.formatDate(date, "Europe/London", "dd/MM/yyyy HH:mm"); }
function scCleanClockText_(value, limit) {
  if (typeof value !== "string" || value.length > limit) scFail_("Keep the work description within " + limit + " characters.");
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
function scClockCellText_(value) { return /^[=+\-@']/.test(value) ? "'" + value : value; }
function scDisplayText_(value) { var text = String(value || ""); return /^'[=+\-@']/.test(text) ? text.slice(1) : text; }

