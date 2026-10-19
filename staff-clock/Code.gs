/**
 * STAFF CLOCK — STAGE 1: DATA SETUP ONLY.
 * Use a NEW spreadsheet named "Choice Staff Timekeeping - Test".
 * Run setupStaffClock as its owner. No PINs are generated or displayed.
 */
var SC_STAFF = [
  ["dan", "Dan", "Management", "dan@choicewellbeingservice.org", true],
  ["tracey", "Tracey", "Management", "tracey@choicewellbeingservice.org", true],
  ["hayley", "Hayley", "Management", "hayley@choicewellbeingservice.org", true],
  ["tara", "Tara", "Staff", "tara@choicewellbeingservice.org", true],
  ["louise", "Louise", "Staff", "louise@choicewellbeingservice.org", true]
];
var SC_HEADERS = {
  Staff: ["Staff ID", "Name", "Role", "Email", "Enabled"],
  Shifts: ["Shift ID", "Staff ID", "Clock in", "Clock out", "Status", "Clock-in request ID", "Clock-out request ID"],
  Work_Segments: ["Segment ID", "Shift ID", "Staff ID", "Location", "Start time", "End time", "Work description", "Request ID"],
  Corrections: ["Correction ID", "Shift ID", "Segment ID", "Changed at", "Changed by", "Reason", "Previous data", "New data", "Result"]
};

function setupStaffClock() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email"
  ]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty("STAFF_SPREADSHEET_ID");
  if (!ss || (id ? ss.getId() !== id : ss.getName() !== "Choice Staff Timekeeping - Test")) {
    throw new Error('Use the NEW spreadsheet named "Choice Staff Timekeeping - Test".');
  }
  if (properties.getProperty("RECEPTION_SPREADSHEET_ID")) {
    throw new Error("This is the visitor reception project. Use a separate staff spreadsheet and Apps Script project.");
  }
  var email = Session.getActiveUser().getEmail();
  var owner = ss.getOwner();
  if (!email || !owner || owner.getEmail().toLowerCase() !== email.toLowerCase()) {
    throw new Error("Run staff setup as the owner of the new staff spreadsheet.");
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Validate all existing tabs before making any changes.
    Object.keys(SC_HEADERS).forEach(function(name) {
      var sheet = ss.getSheetByName(name);
      if (sheet && sheet.getLastRow() > 0) scValidateHeaders_(sheet, SC_HEADERS[name]);
    });
    Object.keys(SC_HEADERS).forEach(function(name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      if (sheet.getLastRow() === 0) {
        var headings = SC_HEADERS[name];
        sheet.getRange(1, 1, 1, headings.length).setValues([headings]);
        sheet.getRange(1, 1, 1, headings.length)
          .setBackground("#286247").setFontColor("#ffffff").setFontWeight("bold");
        sheet.setFrozenRows(1);
        sheet.setColumnWidths(1, headings.length, 180);
      }
    });
    var staff = ss.getSheetByName("Staff");
    if (staff.getLastRow() === 1) {
      staff.getRange(2, 5, SC_STAFF.length, 1).insertCheckboxes();
      staff.getRange(2, 1, SC_STAFF.length, SC_STAFF[0].length).setValues(SC_STAFF);
      staff.getRange(2, 3, SC_STAFF.length, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(["Management", "Staff"], true)
          .setAllowInvalid(false).build()
      );
      staff.setColumnWidth(4, 300);
    }
    ss.getSheetByName("Shifts").getRange("C:D").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    ss.getSheetByName("Work_Segments").getRange("E:F").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    ss.getSheetByName("Work_Segments").setColumnWidth(7, 320);
    ss.getSheetByName("Corrections").getRange("D:D").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    ss.getSheetByName("Corrections").getRange("F:I").setWrap(true);
    ss.setSpreadsheetTimeZone("Europe/London");
    SpreadsheetApp.flush();
    properties.setProperty("STAFF_SPREADSHEET_ID", ss.getId());
    properties.setProperty("STAFF_BREAK_POLICY", "PAID_NO_DEDUCTION");
    if (!properties.getProperty("STAFF_DEVICE_KEY")) {
      properties.setProperty("STAFF_DEVICE_KEY", Utilities.getUuid() + Utilities.getUuid());
    }
    console.log("Staff clock data setup complete. Five initial accounts: Dan, Tracey and Hayley are Management; Tara and Louise are Staff.");
    console.log("Paid breaks: no deduction. Locations planned: Choice building, Working from home, Off-site work.");
    console.log("Existing records and keys were preserved. No PINs or clocking interface are active yet.");
  } finally {
    lock.releaseLock();
  }
}

function scValidateHeaders_(sheet, headings) {
  if (sheet.getLastColumn() !== headings.length ||
      sheet.getRange(1, 1, 1, headings.length).getValues()[0].join("\t") !== headings.join("\t")) {
    throw new Error(sheet.getName() + " has a different layout. No setup changes were made.");
  }
}
