/**
 * Choice Reception test backend.
 * Source is maintained in GitHub on rebuild/reception-test.
 * Editor: run setupReception after pasting this file.
 */
var RECEPTION_HEADERS = ["Visit ID", "Name", "Car Registration", "Visit Type",
  "Practitioner or Activity", "Arrival Time", "Departure Time", "Status", "Request ID"];
var RECEPTION_HOSTS = ["Tara", "Louise", "Tracey", "Hayley", "Dan"];
var RECEPTION_ACTIVITIES = ["Dance class", "Craft group", "Coffee morning", "Other activity"];

function setupReception() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getName() !== "Choice Reception - Test") {
    throw new Error('Open Apps Script from "Choice Reception - Test".');
  }
  // Never allow an anonymous web visitor to run editor setup.
  var editor = Session.getActiveUser().getEmail();
  if (!editor || editor !== Session.getEffectiveUser().getEmail()) {
    throw new Error("Run setup from your own Apps Script editor.");
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ss.getSheetByName("Visits");
    if (sheet && sheet.getLastRow() > 0) {
      validateHeaders_(sheet);
    } else {
      if (!sheet) sheet = ss.insertSheet("Visits");
      sheet.getRange(1, 1, 1, RECEPTION_HEADERS.length).setValues([RECEPTION_HEADERS]);
      sheet.getRange(1, 1, 1, RECEPTION_HEADERS.length)
        .setFontWeight("bold").setBackground("#2f855a").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
      sheet.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm:ss");
      sheet.autoResizeColumns(1, RECEPTION_HEADERS.length);
    }
    ss.setSpreadsheetTimeZone("Europe/London");
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty("RECEPTION_SPREADSHEET_ID", ss.getId());
    if (!properties.getProperty("KIOSK_KEY")) {
      properties.setProperty("KIOSK_KEY", Utilities.getUuid() + Utilities.getUuid());
    }
    console.log("Reception test setup complete. Existing visits preserved.");
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  // Stage 2 connection check. The kiosk interface is added in the next step.
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="font:20px Arial;padding:32px"><h1>Choice Reception Test</h1>' +
    '<p>The test connection is ready. The sign-in screen will be added next.</p></body></html>'
  ).setTitle("Choice Reception Test");
}

/**
 * The future Apps Script HTML interface calls this with google.script.run.
 * No attendance data or mutations are available through URL parameters / JSONP.
 * The device key is entered on the iPad, never published in GitHub.
 */
function receptionRequest(request) {
  var lock;
  try {
    var properties = PropertiesService.getScriptProperties();
    var key = properties.getProperty("KIOSK_KEY");
    if (!request || !key || request.key !== key) {
      return {status: "error", message: "This device needs to be connected by a manager."};
    }
    if (request.action === "config") {
      return {status: "success", hosts: RECEPTION_HOSTS, activities: RECEPTION_ACTIVITIES};
    }
    var spreadsheetId = properties.getProperty("RECEPTION_SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("Setup has not been completed.");
    var ss = SpreadsheetApp.openById(spreadsheetId);
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var sheet = ss.getSheetByName("Visits");
    validateHeaders_(sheet);
    var rows = sheet.getDataRange().getValues();
    var now = new Date();
    var result;
    if (request.action === "signIn") result = signIn_(sheet, rows, request, now);
    else if (request.action === "findVisit") result = findVisit_(rows, request, now);
    else if (request.action === "signOut") result = signOut_(sheet, rows, request, now);
    else result = {status: "error", message: "Unknown action. Please return to the welcome screen."};
    SpreadsheetApp.flush();
    return result;
  } catch (error) {
    // Do not include request contents, keys or visitor details in logs or errors.
    console.error("Reception request failed.");
    return {status: "error", message: "Unable to confirm saving. Please retry the same action or ask a member of staff."};
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function signIn_(sheet, rows, request, now) {
  var name = cleanText_(request.name, 100);
  var carReg = cleanText_(request.carReg || "", 20).toUpperCase();
  var type = request.visitType;
  var destination = cleanText_(request.destination, 100);
  var requestId = request.requestId;
  if (!name || !destination || !validId_(requestId)) {
    return {status: "error", message: "Please enter your name and reason for visiting."};
  }
  if (type !== "Appointment" && type !== "Community activity" && type !== "Other visit") {
    return {status: "error", message: "Please choose a visit type."};
  }
  if ((type === "Appointment" && RECEPTION_HOSTS.indexOf(destination) === -1) ||
      (type === "Community activity" && RECEPTION_ACTIVITIES.indexOf(destination) === -1)) {
    return {status: "error", message: "Please choose an option from the list."};
  }
  // Retry the same request without creating another visit, including after sign-out.
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][8] === requestId) {
      if (normalName_(rows[i][1]) !== normalName_(name) ||
          displayText_(rows[i][2]) !== carReg ||
          rows[i][3] !== type || displayText_(rows[i][4]) !== destination) {
        return {status: "error", message: "This request reference has already been used. Please start again."};
      }
      return {status: "success", visitId: rows[i][0], alreadySaved: true};
    }
  }
  var visitId = Utilities.getUuid();
  sheet.appendRow([visitId, sheetText_(name), sheetText_(carReg), type,
    sheetText_(destination), now, "", "Signed in", requestId]);
  return {status: "success", visitId: visitId, alreadySaved: false};
}

function findVisit_(rows, request, now) {
  var name = cleanText_(request.name, 100);
  if (!name) return {status: "error", message: "Please enter your full name."};
  var visits = [];
  var today = londonDate_(now);
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (normalName_(row[1]) === normalName_(name) && row[7] === "Signed in" &&
        !row[6] && row[5] instanceof Date && londonDate_(row[5]) === today) {
      // Only return matches for the supplied full name, never a whole visitor list.
      visits.push({visitId: row[0], arrival: Utilities.formatDate(row[5], "Europe/London", "HH:mm"),
        visitType: row[3], destination: displayText_(row[4]),
        carHint: displayText_(row[2]).replace(/\s/g, "").slice(-3)});
    }
  }
  return {status: "success", visits: visits};
}

function signOut_(sheet, rows, request, now) {
  if (!validId_(request.visitId)) return {status: "error", message: "Please find your visit again."};
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] !== request.visitId) continue;
    if (rows[i][6]) return {status: "success", alreadySaved: true};
    // Yesterday's unclosed visits remain untouched for staff review.
    if (!(rows[i][5] instanceof Date) || londonDate_(rows[i][5]) !== londonDate_(now)) {
      return {status: "error", message: "Please ask a member of staff to close this older visit."};
    }
    if (rows[i][7] !== "Signed in") return {status: "error", message: "Please ask a member of staff to check this visit."};
    sheet.getRange(i + 1, 7, 1, 2).setValues([[now, "Signed out"]]);
    return {status: "success", alreadySaved: false};
  }
  return {status: "error", message: "Visit not found. Please find your visit again."};
}

function validateHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() !== RECEPTION_HEADERS.length ||
      sheet.getRange(1, 1, 1, RECEPTION_HEADERS.length).getValues()[0].join("\t") !== RECEPTION_HEADERS.join("\t")) {
    throw new Error("Visits layout does not match. Existing records were not changed.");
  }
}

function cleanText_(value, max) {
  if (typeof value !== "string" || value.length > max) return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
function normalName_(value) { return displayText_(value).replace(/\s+/g, " ").trim().toLowerCase(); }
function sheetText_(value) { return /^[=+\-@']/.test(value) ? "'" + value : value; }
function displayText_(value) {
  var text = String(value || "");
  return /^'[=+\-@']/.test(text) ? text.slice(1) : text;
}
function validId_(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value); }
function londonDate_(date) { return Utilities.formatDate(date, "Europe/London", "yyyy-MM-dd"); }
