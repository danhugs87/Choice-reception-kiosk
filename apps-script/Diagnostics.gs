/**
 * Read-only diagnostics. Run manually from the bound Apps Script editor.
 * Does not add, edit or delete visits. Never logs the device key or visitor data.
 */
function diagnoseReception() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  var editor = Session.getActiveUser().getEmail();
  if (!active || !editor || editor !== Session.getEffectiveUser().getEmail()) {
    throw new Error("Run this check from your own spreadsheet's Apps Script editor.");
  }
  var stage = "configuration";
  try {
    var properties = PropertiesService.getScriptProperties();
    var id = properties.getProperty("RECEPTION_SPREADSHEET_ID");
    if (!id) throw new Error("RECEPTION_SPREADSHEET_ID is missing. Run setupReception.");
    if (!properties.getProperty("KIOSK_KEY")) throw new Error("KIOSK_KEY is missing. Run setupReception.");
    console.log("CHECK 1 OK: Connection settings exist.");
    stage = "opening the test spreadsheet";
    var ss = SpreadsheetApp.openById(id);
    if (ss.getId() !== active.getId()) throw new Error("Connection points to a different spreadsheet.");
    console.log("CHECK 2 OK: The connected spreadsheet opens and matches this project.");
    stage = "finding the Visits tab";
    var sheet = ss.getSheetByName("Visits");
    if (!sheet) throw new Error("Visits tab is missing. Run setupReception.");
    console.log("CHECK 3 OK: Visits tab found.");
    stage = "checking column headings";
    var expected = ["Visit ID", "Name", "Car Registration", "Visit Type",
      "Practitioner or Activity", "Arrival Time", "Departure Time", "Status", "Request ID"];
    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    var mismatches = [];
    for (var i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) mismatches.push("column " + (i + 1));
    }
    if (mismatches.length) throw new Error("Unexpected heading in " + mismatches.join(", ") + ".");
    if (sheet.getLastColumn() !== expected.length) {
      throw new Error("Visits has " + sheet.getLastColumn() + " populated columns; expected 9.");
    }
    console.log("CHECK 4 OK: All nine column headings match.");
    stage = "reading attendance records";
    var rows = sheet.getDataRange().getValues();
    console.log("CHECK 5 OK: Read access works. Data rows: " + Math.max(0, rows.length - 1) + ".");
    console.log("CHECK PASSED: The editor can read the configured log. If the webpage still fails, check its deployed version and execution permissions.");
  } catch (error) {
    console.log("CHECK FAILED at " + stage + ": " + error.message);
  }
}
