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
  var configuredId = PropertiesService.getScriptProperties().getProperty("RECEPTION_SPREADSHEET_ID");
  if (!ss || (configuredId ? ss.getId() !== configuredId : ss.getName() !== "Choice Reception - Test")) {
    throw new Error("Open Apps Script from the connected reception spreadsheet.");
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
  return HtmlService.createHtmlOutputFromFile("Kiosk")
    .setTitle("Choice Reception")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
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
    if (!request || !isReceptionKey_(request.key, properties, key)) {
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
    // Attendance is committed before attempting email. Retrying a saved visit
    // does not send another notification.
    if (request.action === "signIn" && result.status === "success" && !result.alreadySaved) {
      result.notification = sendArrivalAlert_(ss, request, result.visitId, now);
    }
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


/**
 * Editor-only: creates/replaces the private iPad shortcut.
 * Copy its URL from your own execution log; do not share it publicly.
 * Running again revokes the previous iPad shortcut, not the manager key.
 */
function createIpadLink() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email"
  ]);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  var editor = Session.getActiveUser().getEmail();
  var properties = PropertiesService.getScriptProperties();
  if (!active || !editor || editor !== Session.getEffectiveUser().getEmail() ||
      active.getId() !== properties.getProperty("RECEPTION_SPREADSHEET_ID")) {
    throw new Error("Run this from the test spreadsheet's Apps Script editor.");
  }
  if (!properties.getProperty("KIOSK_KEY")) throw new Error("Run setupReception first.");
  // Use the exact working test deployment; editor auto-discovery may return another address.
  var url = "https://script.google.com/macros/s/AKfycbzKymNKF4ceK2eOGa2jBqEvy2-PugqK-mSJzBtY-sWsanRFBLdsEIE7G7GEcjEq4vMqqA/exec";
  if (!url || !/\/exec$/.test(url)) {
    throw new Error("Deploy the test web app first, then run this from the editor.");
  }
  var token = Utilities.getUuid() + Utilities.getUuid();
  properties.setProperty("IPAD_TOKEN_HASH", deviceTokenHash_(token));
  console.log("PRIVATE IPAD LINK — keep this to yourself:");
  console.log(url + "#device=" + encodeURIComponent(token));
}

function isReceptionKey_(candidate, properties, managerKey) {
  if (typeof candidate !== "string" || !candidate || candidate.length > 200) return false;
  if (managerKey && candidate === managerKey) return true;
  var expected = properties.getProperty("IPAD_TOKEN_HASH");
  return !!expected && deviceTokenHash_(candidate) === expected;
}

function deviceTokenHash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
    .map(function(value) { return ("0" + ((value + 256) % 256).toString(16)).slice(-2); }).join("");
}

/** Confirmed practitioner addresses. No fallback recipient. */
var RECEPTION_STAFF_EMAILS = {
  Tara: "tara@choicewellbeingservice.org",
  Louise: "louise@choicewellbeingservice.org",
  Tracey: "tracey@choicewellbeingservice.org",
  Hayley: "hayley@choicewellbeingservice.org",
  Dan: "dan@choicewellbeingservice.org"
};
var ARRIVAL_ALERT_HEADERS = ["Visit ID", "Practitioner", "Email status", "Attempt time", "Detail"];

/**
 * Editor-only setup. Requests sending permission but does not send any email.
 * Existing visits are never emailed retrospectively.
 */
function setupArrivalAlerts() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.send_mail"
  ]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var email = Session.getActiveUser().getEmail();
  var properties = PropertiesService.getScriptProperties();
  if (!ss || !email || email !== Session.getEffectiveUser().getEmail() ||
      ss.getId() !== properties.getProperty("RECEPTION_SPREADSHEET_ID")) {
    throw new Error("Run setup from the connected test spreadsheet's Apps Script editor.");
  }
  validateHeaders_(ss.getSheetByName("Visits"));
  var quota = MailApp.getRemainingDailyQuota();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ss.getSheetByName("Arrival_Alerts");
    if (sheet && sheet.getLastRow() > 0) {
      validateAlertHeaders_(sheet);
    } else {
      if (!sheet) sheet = ss.insertSheet("Arrival_Alerts");
      sheet.getRange(1, 1, 1, ARRIVAL_ALERT_HEADERS.length).setValues([ARRIVAL_ALERT_HEADERS]);
      sheet.getRange(1, 1, 1, ARRIVAL_ALERT_HEADERS.length)
        .setBackground("#286247").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);
      sheet.getRange("D:D").setNumberFormat("dd/MM/yyyy HH:mm:ss");
      sheet.setColumnWidth(1, 280);
      sheet.setColumnWidth(2, 140);
      sheet.setColumnWidth(3, 170);
      sheet.setColumnWidth(4, 180);
      sheet.setColumnWidth(5, 350);
      sheet.getRange("E:E").setWrap(true);
    }
    SpreadsheetApp.flush();
    properties.setProperty("ARRIVAL_ALERTS_ENABLED", "true");
    console.log("Appointment alerts enabled. Remaining email-recipient allowance: " + quota + ".");
    console.log("No email was sent by setup. Test one new fictional appointment with Dan.");
  } finally {
    lock.releaseLock();
  }
}

function validateAlertHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() !== ARRIVAL_ALERT_HEADERS.length ||
      sheet.getRange(1, 1, 1, ARRIVAL_ALERT_HEADERS.length).getValues()[0].join("\t") !== ARRIVAL_ALERT_HEADERS.join("\t")) {
    throw new Error("Arrival_Alerts layout does not match. No alert sent.");
  }
}

/**
 * Called under the attendance lock. Never throws to the visitor flow.
 * Records an attempt before sending and never automatically resends.
 */
function sendArrivalAlert_(ss, request, visitId, arrivedAt) {
  try {
    if (request.visitType !== "Appointment") return "Not applicable";
    if (PropertiesService.getScriptProperties().getProperty("ARRIVAL_ALERTS_ENABLED") !== "true") return "Disabled";
    var host = request.destination;
    var recipient = RECEPTION_STAFF_EMAILS[host];
    if (!recipient) return "No configured recipient";
    var sheet = ss.getSheetByName("Arrival_Alerts");
    validateAlertHeaders_(sheet);
    var entries = sheet.getDataRange().getValues();
    for (var i = 1; i < entries.length; i++) {
      if (entries[i][0] === visitId) return "Already attempted";
    }
    var attemptTime = new Date();
    sheet.appendRow([visitId, host, "Sending", attemptTime, "Check manually if this status remains."]);
    SpreadsheetApp.flush();
    var row = sheet.getLastRow();
    try {
      if (MailApp.getRemainingDailyQuota() < 1) {
        sheet.getRange(row, 3, 1, 3).setValues([["Not sent", attemptTime, "Daily email allowance exhausted."]]);
        return "Not sent";
      }
      var arrival = Utilities.formatDate(arrivedAt, "Europe/London", "dd/MM/yyyy HH:mm");
      var visitorName = cleanText_(request.name, 100);
      MailApp.sendEmail({
        to: recipient,
        subject: "Choice reception: your appointment has arrived",
        body: "Hi " + host + ",\n\n" + visitorName +
          " has signed in at Choice reception.\n\nArrival: " + arrival +
          " (UK time)\n\nChoice Wellbeing Service reception",
        name: "Choice Reception"
      });
      // Submitted means accepted by Google's service, not confirmed inbox delivery.
      sheet.getRange(row, 3, 1, 3).setValues([["Submitted", attemptTime, "Accepted by Google; inbox delivery is not confirmed."]]);
      return "Submitted";
    } catch (error) {
      // A service interruption can leave delivery uncertain. Do not auto-resend.
      try {
        sheet.getRange(row, 3, 1, 3).setValues([["Not confirmed", attemptTime, "Check the practitioner's inbox. No automatic resend."]]);
      } catch (ignored) {}
      console.error("Arrival email could not be confirmed. Attendance remains saved.");
      return "Not confirmed";
    }
  } catch (error) {
    console.error("Arrival alert was unavailable. Attendance remains saved.");
    return "Not confirmed";
  }
}
