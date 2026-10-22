/**
 * Read-only owner diagnostics for the staff clock.
 * Run manually from the STAFF spreadsheet's bound Apps Script editor.
 * No setup, PIN generation/reset, recovery, or attendance writes are performed.
 */
function diagnoseStaffClock() {
  var stage = "checking the staff project", spreadsheetId = "";
  try {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("RECEPTION_SPREADSHEET_ID")) {
      throw new Error("This is the visitor reception project. Open the staff spreadsheet's Apps Script editor instead.");
    }
    spreadsheetId = properties.getProperty("STAFF_SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("STAFF_SPREADSHEET_ID is missing. Do not rerun setup; check that this is the original staff project.");
    if (typeof scPinOwner_ !== "function") throw new Error("Pins.gs is missing or incomplete: scPinOwner_ was not found.");
    stage = "checking owner access and authorisation";
    var owner = scPinOwner_();
    console.log("CHECK 1 OK: Original staff project and owner access confirmed.");
    stage = "opening the staff spreadsheet";
    var ss = SpreadsheetApp.openById(spreadsheetId);
    if (ss.getId() !== owner.ss.getId()) throw new Error("The configured spreadsheet does not match the spreadsheet bound to this project.");
    console.log("CHECK 2 OK: The configured staff spreadsheet opens.");
    stage = "checking the staff-loading functions";
    if (typeof staffClockRequest !== "function") throw new Error("Clock.gs is missing or incomplete: staffClockRequest was not found.");
    if (typeof scStaffLogGate_ !== "function") throw new Error("Clock.gs is missing or incomplete: scStaffLogGate_ was not found.");
    if (typeof scPinAccounts_ !== "function") throw new Error("Pins.gs is missing or incomplete: scPinAccounts_ was not found.");
    if (typeof scValidateHeaders_ !== "function" || typeof SC_HEADERS === "undefined") throw new Error("Code.gs is missing or incomplete: the staff table definitions were not found.");
    console.log("CHECK 3 OK: Staff-loading functions are present.");
    stage = "checking the live log is available";
    var gate = scStaffLogGate_(properties, {action: "listStaff"});
    if (gate) throw new Error(gate.message || "The staff log is paused for review. Do not remove its checkpoint or rerun go-live.");
    console.log("CHECK 4 OK: The live log is available.");
    stage = "checking the Staff tab";
    var accounts = scPinAccounts_(ss);
    var enabled = accounts.filter(function(account) { return account.enabled; }).length;
    console.log("CHECK 5 OK: Staff layout and account settings are readable. Enabled accounts: " + enabled + ".");
    stage = "checking the staff-list response";
    var result = staffClockRequest({action: "listStaff"});
    if (!result || result.status !== "success" || !Array.isArray(result.staff)) {
      throw new Error(result && result.message || "The staff-list request did not succeed.");
    }
    console.log("CHECK 6 OK: The editor can load the staff list. Accounts returned: " + result.staff.length + ".");
    console.log("CHECK PASSED: Current editor code can load staff. If the webpage still fails, check the existing deployment's version, Execute as setting, access setting and the staff link.");
  } catch (error) {
    var message = String(error && error.message || error);
    if (spreadsheetId) message = message.split(spreadsheetId).join("[configured spreadsheet]");
    console.log("CHECK FAILED at " + stage + ": " + message);
    console.log("This check did not change hours, PINs, setup or go-live settings.");
  }
}
