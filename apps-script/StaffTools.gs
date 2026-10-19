/**
 * Staff tools run from the restricted Google Sheet, not the reception webpage.
 * Owner: run setupStaffTools once. A Reception menu is added to the sheet.
 */
var VISIT_CORRECTION_HEADERS = [
  "Correction ID", "Visit ID", "Corrected at", "Corrected by", "Previous status",
  "Previous departure", "Recorded departure", "New status", "Reason", "Result"
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Reception")
    .addItem("Close selected visit", "closeSelectedVisit")
    .addToUi();
}

function setupStaffTools() {
  var context = staffContext_(true);
  var ss = context.ss;
  validateHeaders_(ss.getSheetByName("Visits"));
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var audit = ss.getSheetByName("Visit_Corrections");
    if (audit && audit.getLastRow() > 0) {
      validateCorrectionHeaders_(audit);
    } else {
      if (!audit) audit = ss.insertSheet("Visit_Corrections");
      audit.getRange(1, 1, 1, VISIT_CORRECTION_HEADERS.length).setValues([VISIT_CORRECTION_HEADERS]);
      audit.getRange(1, 1, 1, VISIT_CORRECTION_HEADERS.length)
        .setBackground("#286247").setFontColor("#ffffff").setFontWeight("bold");
      audit.setFrozenRows(1);
      audit.getRange("C:C").setNumberFormat("dd/MM/yyyy HH:mm:ss");
      audit.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm:ss");
      audit.setColumnWidths(1, 2, 280);
      audit.setColumnWidth(3, 180);
      audit.setColumnWidth(4, 260);
      audit.setColumnWidths(5, 4, 210);
      audit.setColumnWidth(9, 350);
      audit.setColumnWidth(10, 180);
      audit.getRange("I:J").setWrap(true);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  onOpen();
  console.log("Staff tools ready. In Visits, select one visit row and use Reception > Close selected visit.");
}

function staffContext_(ownerOnly) {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email"
  ]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var email = Session.getActiveUser().getEmail();
  var properties = PropertiesService.getScriptProperties();
  if (!ss || !email || ss.getId() !== properties.getProperty("RECEPTION_SPREADSHEET_ID")) {
    throw new Error("Open the connected spreadsheet in your signed-in staff account.");
  }
  var owner = ss.getOwner();
  var ownerEmail = owner ? owner.getEmail() : "";
  // Extra managers must already have spreadsheet access and be listed by the owner.
  var extra = (properties.getProperty("STAFF_MANAGER_EMAILS") || "")
    .split(",").map(function(value) { return value.trim().toLowerCase(); }).filter(Boolean);
  var isOwner = ownerEmail && ownerEmail.toLowerCase() === email.toLowerCase();
  if (!isOwner && (ownerOnly || extra.indexOf(email.toLowerCase()) === -1)) {
    throw new Error("Only the spreadsheet owner or a configured manager can make corrections.");
  }
  return {ss: ss, email: email};
}

function closeSelectedVisit() {
  var ui = SpreadsheetApp.getUi();
  try {
    var context = staffContext_(false);
    var sheet = context.ss.getActiveSheet();
    var selection = sheet.getActiveRange();
    if (sheet.getName() !== "Visits" || !selection ||
        selection.getNumRows() !== 1 || selection.getRow() < 2) {
      throw new Error("In Visits, select a cell in one visitor row first.");
    }
    validateHeaders_(sheet);
    var original = sheet.getRange(selection.getRow(), 1, 1, 9).getValues()[0];
    assertOpenCorrectionVisit_(original);
    var who = displayText_(original[1]);
    var arrival = Utilities.formatDate(original[5], "Europe/London", "dd/MM/yyyy HH:mm");
    var reasonPrompt = ui.prompt(
      "Close visit: " + who,
      "Arrived: " + arrival + " (UK time).\nEnter the reason and how departure was confirmed. Cancel if the person might still be inside.",
      ui.ButtonSet.OK_CANCEL
    );
    if (reasonPrompt.getSelectedButton() !== ui.Button.OK) return;
    var reason = cleanText_(reasonPrompt.getResponseText(), 300);
    if (reason.length < 5) throw new Error("Please provide a reason of 5–300 characters.");
    var timePrompt = ui.prompt(
      "Actual departure time",
      "If known, enter dd/MM/yyyy HH:mm in UK time. Leave blank if unknown. Do not estimate a time.",
      ui.ButtonSet.OK_CANCEL
    );
    if (timePrompt.getSelectedButton() !== ui.Button.OK) return;
    var departure = parseCorrectionTime_(timePrompt.getResponseText().trim());
    var departureText = departure ?
      Utilities.formatDate(departure, "Europe/London", "dd/MM/yyyy HH:mm") :
      "Unknown — departure time will remain blank";
    var confirmed = ui.alert(
      "Confirm staff correction",
      who + "\nArrived: " + arrival + "\nDeparture: " + departureText + "\nReason: " + reason +
        "\n\nThis closes the visit and records your account and correction time.",
      ui.ButtonSet.YES_NO
    );
    if (confirmed !== ui.Button.YES) return;
    // UI prompts suspend scripts and release locks. Recheck identity and record,
    // then acquire the lock only for the final write.
    context = staffContext_(false);
    var outcome = applyVisitCorrection_(context.ss, original, reason, departure, context.email, new Date());
    ui.alert(outcome.auditConfirmed ?
      "Visit closed. The staff correction is recorded in Visit_Corrections." :
      "Visit closed, but the audit result could not be confirmed. Check Visit_Corrections before making further changes.");
  } catch (error) {
    ui.alert(error.message);
  }
}

function parseCorrectionTime_(text) {
  if (!text) return null;
  if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(text)) {
    throw new Error("Use dd/MM/yyyy HH:mm, or leave the departure time blank.");
  }
  var date;
  try {
    date = Utilities.parseDate(text, "Europe/London", "dd/MM/yyyy HH:mm");
  } catch (error) {
    throw new Error("That departure date or time is not valid.");
  }
  if (!(date instanceof Date) || isNaN(date.getTime()) ||
      Utilities.formatDate(date, "Europe/London", "dd/MM/yyyy HH:mm") !== text) {
    throw new Error("That departure date or time is not valid.");
  }
  return date;
}

function assertOpenCorrectionVisit_(row) {
  if (!row || !validId_(row[0]) || !(row[5] instanceof Date) || isNaN(row[5].getTime())) {
    throw new Error("This row is not a valid recorded visit.");
  }
  if (row[6] || row[7] !== "Signed in") {
    throw new Error("This visit is already closed or needs a separate review. No change was made.");
  }
}

function validateCorrectionHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() !== VISIT_CORRECTION_HEADERS.length ||
      sheet.getRange(1, 1, 1, VISIT_CORRECTION_HEADERS.length).getValues()[0].join("\t") !== VISIT_CORRECTION_HEADERS.join("\t")) {
    throw new Error("Run setupStaffTools to prepare the corrections log. No visit was changed.");
  }
}

/** Private write helper. Uses the stable visit ID, even if rows have been sorted. */
function applyVisitCorrection_(ss, original, reason, departure, editor, now) {
  if (!editor || cleanText_(reason, 300).length < 5) throw new Error("A staff account and correction reason are required.");
  if (departure && (!(departure instanceof Date) || isNaN(departure.getTime()))) throw new Error("Invalid departure time.");
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ss.getSheetByName("Visits");
    validateHeaders_(sheet);
    var rows = sheet.getDataRange().getValues();
    var matches = [];
    for (var i = 1; i < rows.length; i++) if (rows[i][0] === original[0]) matches.push(i);
    if (matches.length !== 1) throw new Error("The visit reference is missing or duplicated. No change was made.");
    var index = matches[0], current = rows[index];
    assertOpenCorrectionVisit_(current);
    if (current[1] !== original[1] || current[3] !== original[3] || current[4] !== original[4] ||
        current[5].getTime() !== original[5].getTime()) {
      throw new Error("This visit changed while the dialog was open. Select it again.");
    }
    if (departure && (departure.getTime() < current[5].getTime() || departure.getTime() > now.getTime())) {
      throw new Error("Departure must be on or after arrival and cannot be in the future.");
    }
    var audit = ss.getSheetByName("Visit_Corrections");
    validateCorrectionHeaders_(audit);
    var newStatus = departure ? "Signed out - staff correction" : "Closed by staff - time unknown";
    var correctionId = Utilities.getUuid();
    audit.appendRow([correctionId, current[0], now, editor, current[7], current[6] || "",
      departure || "", newStatus, sheetText_(reason), "Pending"]);
    SpreadsheetApp.flush();
    var auditRow = audit.getLastRow();
    try {
      sheet.getRange(index + 1, 7, 1, 2).setValues([[departure || "", newStatus]]);
      SpreadsheetApp.flush();
    } catch (error) {
      try { audit.getRange(auditRow, 10).setValue("Not confirmed — check visit"); } catch (ignored) {}
      throw new Error("The correction could not be confirmed. Check Visits and Visit_Corrections before retrying.");
    }
    try {
      audit.getRange(auditRow, 10).setValue("Applied");
      SpreadsheetApp.flush();
      return {auditConfirmed: true};
    } catch (error) {
      return {auditConfirmed: false};
    }
  } finally {
    lock.releaseLock();
  }
}
