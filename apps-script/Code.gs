/**
 * Choice reception rebuild — stage 1: test spreadsheet setup.
 * Run setupReception manually in the Apps Script project attached to
 * "Choice Reception - Test". This does not deploy or change the live kiosk.
 */
function setupReception() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getName() !== "Choice Reception - Test") {
    throw new Error('Open Apps Script from the spreadsheet named "Choice Reception - Test".');
  }
  var headers = [
    "Visit ID", "Name", "Car Registration", "Visit Type",
    "Practitioner or Activity", "Arrival Time", "Departure Time",
    "Status", "Request ID"
  ];
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ss.getSheetByName("Visits");
    if (sheet && sheet.getLastRow() > 0) {
      var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (existing.join("\t") !== headers.join("\t") ||
          sheet.getLastColumn() !== headers.length) {
        throw new Error('The Visits tab has a different layout. No data was changed.');
      }
      return "Visits already set up. Existing records were preserved.";
    }
    if (!sheet) sheet = ss.insertSheet("Visits");
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold").setBackground("#2f855a").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    sheet.autoResizeColumns(1, headers.length);
    return "Test Visits tab created. Set the spreadsheet and Apps Script time zones to Europe/London before testing.";
  } finally {
    lock.releaseLock();
  }
}
