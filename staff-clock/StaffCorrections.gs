/** Management-only correction of an OPEN shift using a confirmed actual finish. */
function setupStaffCorrections() {
  var owner = scPinOwner_();
  scClockTables_(owner.ss);
  scValidateHeaders_(owner.ss.getSheetByName("Corrections"), SC_HEADERS.Corrections);
  owner.ss.getSheetByName("Corrections").getRange("D:D").setNumberFormat("dd/MM/yyyy HH:mm:ss");
  owner.ss.getSheetByName("Corrections").getRange("F:I").setWrap(true);
  console.log("Staff corrections ready. Management can close a missed clock-out with a confirmed finish time and reason. No time records were changed.");
}

/** Called only after the main RPC verifies the current Management role and lock. */
function scStaffCorrectionRequest_(ss, actor, request) {
  if (actor.role !== "Management") scFail_("Management access is required.");
  scRecoverStaffCorrections_(ss, null);
  var message = "";
  if (request.action === "closeMissedShift") {
    scCreateStaffCorrection_(ss, actor, request);
    message = "Correction recorded. The confirmed finish time is now included in the hours.";
  }
  return {status: "success", message: message, shifts: scManagementOpenShifts_(ss)};
}

function scManagementOpenShifts_(ss) {
  var names = {};
  scPinAccounts_(ss).forEach(function(a) { names[a.id] = a.name; });
  return scRows_(ss, "Shifts").slice(1).filter(function(row) { return row[4] === "Open" && !row[3]; })
    .map(function(row) {
      var pending = scPendingOperations_(ss, row[1]).length > 0;
      if (pending) return {shiftId: row[0], staffId: row[1], name: names[row[1]] || row[1],
        clockIn: scDisplayTime_(row[2]), blocked: true, message: "Ask this person to sign in to finish saving their last clock action."};
      var state = scWorkingState_(ss, row[1]);
      return {shiftId: row[0], staffId: row[1], name: names[row[1]] || row[1], clockIn: state.clockIn,
        location: state.location, locationStart: state.locationStart, blocked: false};
    });
}

function scParseStaffFinish_(text) {
  if (typeof text !== "string") scFail_("Enter a confirmed actual finish time.");
  text = text.trim();
  if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}(:\d{2})?$/.test(text)) scFail_("Use dd/MM/yyyy HH:mm, with optional :ss seconds. A confirmed finish time is required.");
  var format = text.length === 19 ? "dd/MM/yyyy HH:mm:ss" : "dd/MM/yyyy HH:mm";
  var date;
  try { date = Utilities.parseDate(text, "Europe/London", format); }
  catch (error) { scFail_("That finish date or time is not valid."); }
  if (!(date instanceof Date) || isNaN(date.getTime()) || Utilities.formatDate(date, "Europe/London", format) !== text) scFail_("That finish date or time is not valid.");
  return date;
}

function scCreateStaffCorrection_(ss, actor, request) {
  if (typeof request.requestId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(request.requestId)) scFail_("Return to the correction screen and try again.");
  var finish = scParseStaffFinish_(request.finishText);
  var reason = scCleanClockText_(request.reason || "", 300);
  if (reason.length < 5) scFail_("Add a correction reason of 5–300 characters, including how the finish time was confirmed.");
  var audit = ss.getSheetByName("Corrections");
  scValidateHeaders_(audit, SC_HEADERS.Corrections);
  var corrections = audit.getDataRange().getValues(), existing = scFindRow_(corrections, request.requestId);
  if (existing !== -1) {
    var previous = corrections[existing], target = JSON.parse(previous[7]);
    if (previous[1] !== request.shiftId || previous[4] !== actor.id || scDisplayText_(previous[5]) !== reason || target.finishISO !== finish.toISOString()) scFail_("This correction reference was already used for different details.");
    if (previous[8] !== "Applied") scFinishStaffCorrection_(ss, request.requestId);
    return;
  }
  var shifts = scRows_(ss, "Shifts"), shiftIndex = scFindRow_(shifts, request.shiftId);
  if (shiftIndex < 1) scFail_("Shift not found. Reload the open shifts.");
  var shift = shifts[shiftIndex];
  if (shift[4] !== "Open" || shift[3]) scFail_("This shift is already closed. No correction was made.");
  if (scPendingOperations_(ss, shift[1]).length) scFail_("Ask this person to sign in to finish saving their last clock action first.");
  var state = scWorkingState_(ss, shift[1]);
  if (state.shiftId !== request.shiftId) scFail_("The open shift changed. Reload it.");
  var segments = scRows_(ss, "Work_Segments"), segmentIndex = scFindRow_(segments, state.segmentId), segment = segments[segmentIndex];
  if (finish.getTime() < segment[4].getTime() || finish.getTime() < shift[2].getTime()) scFail_("Finish cannot be earlier than the latest location start or clock-in.");
  if (finish.getTime() > Date.now()) scFail_("Finish cannot be in the future.");
  var newShift = shift.slice(), newSegment = segment.slice();
  newShift[3] = finish; newShift[4] = "Closed - staff correction"; newShift[6] = "correction:" + request.requestId;
  newSegment[5] = finish;
  var before = {staffId: shift[1], shift: shift, segment: segment};
  var after = {staffId: shift[1], shift: newShift, segment: newSegment, finishISO: finish.toISOString()};
  audit.appendRow([request.requestId, shift[0], segment[0], new Date(), actor.id, scClockCellText_(reason),
    JSON.stringify(before), JSON.stringify(after), "Pending"]);
  SpreadsheetApp.flush();
  scFinishStaffCorrection_(ss, request.requestId);
}

/** Idempotent application of an already-authorised correction, under the lock. */
function scFinishStaffCorrection_(ss, correctionId) {
  var audit = ss.getSheetByName("Corrections");
  scValidateHeaders_(audit, SC_HEADERS.Corrections);
  var entries = audit.getDataRange().getValues(), index = scFindRow_(entries, correctionId);
  if (index < 1) scFail_("Correction record not found.");
  var entry = entries[index];
  if (entry[8] === "Applied") return;
  if (entry[8] !== "Pending") scFail_("This correction needs owner review.");
  var before = JSON.parse(entry[6]), after = JSON.parse(entry[7]);
  var shifts = scRows_(ss, "Shifts"), segments = scRows_(ss, "Work_Segments");
  var si = scFindRow_(shifts, entry[1]), wi = scFindRow_(segments, entry[2]);
  if (si < 1 || wi < 1 || before.staffId !== after.staffId || shifts[si][1] !== after.staffId || segments[wi][2] !== after.staffId) scFail_("Correction records do not match. Ask the owner to review them.");
  var shiftText = JSON.stringify(shifts[si]), segmentText = JSON.stringify(segments[wi]);
  if ((shiftText !== JSON.stringify(before.shift) && shiftText !== JSON.stringify(after.shift)) ||
      (segmentText !== JSON.stringify(before.segment) && segmentText !== JSON.stringify(after.segment))) scFail_("The time records changed after this correction was requested. Ask the owner to review it.");
  var finish = new Date(after.finishISO);
  if (isNaN(finish.getTime())) scFail_("The recorded finish time needs owner review.");
  if (segmentText !== JSON.stringify(after.segment)) ss.getSheetByName("Work_Segments").getRange(wi + 1, 6).setValue(finish);
  if (shiftText !== JSON.stringify(after.shift)) ss.getSheetByName("Shifts").getRange(si + 1, 4, 1, 4).setValues([[finish, after.shift[4], after.shift[5], after.shift[6]]]);
  SpreadsheetApp.flush();
  audit.getRange(index + 1, 9).setValue("Applied");
  SpreadsheetApp.flush();
}

function scHasPendingStaffCorrection_(ss, id) {
  var audit = ss.getSheetByName("Corrections");
  scValidateHeaders_(audit, SC_HEADERS.Corrections);
  return audit.getDataRange().getValues().slice(1).some(function(row) {
    return row[8] === "Pending" && JSON.parse(row[7]).staffId === id;
  });
}
function scRecoverStaffCorrections_(ss, id) {
  var audit = ss.getSheetByName("Corrections");
  scValidateHeaders_(audit, SC_HEADERS.Corrections);
  var pending = audit.getDataRange().getValues().slice(1).filter(function(row) {
    return row[8] === "Pending" && (!id || JSON.parse(row[7]).staffId === id);
  });
  pending.forEach(function(row) { scFinishStaffCorrection_(ss, row[0]); });
}
