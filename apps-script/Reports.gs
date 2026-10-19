/**
 * Run setupWeeklySummary manually from the test spreadsheet's Apps Script editor.
 * Creates a formula-based report; never changes Visits or existing reports.
 */
function setupWeeklySummary() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email"
  ]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var email = Session.getActiveUser().getEmail();
  var properties = PropertiesService.getScriptProperties();
  if (!ss || !email || email !== Session.getEffectiveUser().getEmail() ||
      ss.getId() !== properties.getProperty("RECEPTION_SPREADSHEET_ID")) {
    throw new Error("Run this from the connected test spreadsheet's Apps Script editor.");
  }
  validateHeaders_(ss.getSheetByName("Visits"));
  if (ss.getSpreadsheetTimeZone() !== "Europe/London") {
    throw new Error("Set the spreadsheet time zone to Europe/London before creating the report.");
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (ss.getSheetByName("Weekly_Summary")) {
      console.log("Weekly_Summary already exists. It and all visit records were left unchanged.");
      return;
    }
    var sheet = ss.insertSheet("Weekly_Summary");
    var hosts = RECEPTION_HOSTS.slice();
    var activities = RECEPTION_ACTIVITIES.slice();
    var hostsHeader = 14;
    var activitiesHeader = hostsHeader + hosts.length + 2;
    var noteRow = activitiesHeader + activities.length + 2;
    var lastRow = noteRow + 2;
    var values = [];
    for (var row = 0; row < lastRow; row++) values.push(["", ""]);
    function put(row, label, value) { values[row - 1] = [label, value === undefined ? "" : value]; }
    put(1, "Choice weekly attendance");
    put(2, "Visits are counted by arrival date. Repeat visits count separately.");
    put(3, "Choose a date");
    put(4, "Week starting Monday");
    put(5, "Week ending Sunday");
    put(7, "Weekly totals", "Visits");
    put(8, "All visits");
    put(9, "Appointments");
    put(10, "Community activities");
    put(11, "Other visits");
    put(12, "No departure recorded");
    put(hostsHeader, "Practitioner", "Appointment visits");
    hosts.forEach(function(name, index) { put(hostsHeader + index + 1, name); });
    put(activitiesHeader, "Community activity", "Visits");
    activities.forEach(function(name, index) { put(activitiesHeader + index + 1, name); });
    put(noteRow, "No departure recorded includes forgotten sign-outs; it is not a current headcount.");
    put(noteRow + 1, "Change the highlighted date to view another week. Enter =TODAY() to return to the current week.");
    put(noteRow + 2, "");
    sheet.getRange(1, 1, lastRow, 2).setValues(values);
    sheet.getRange("B3").setFormula("=TODAY()");
    sheet.getRange("B4").setFormula('=IF(ISNUMBER(B3),INT(B3)-WEEKDAY(INT(B3),2)+1,"")');
    sheet.getRange("B5").setFormula('=IF(ISNUMBER(B4),B4+6,"")');

    // Exclusive next-Monday boundary includes all Sunday arrival times.
    var dates = 'Visits!$F$2:$F,">="&$B$4,Visits!$F$2:$F,"<"&($B$4+7)';
    function countFormula(extra) {
      return '=IF(ISNUMBER($B$4),COUNTIFS(' + dates + (extra ? "," + extra : "") + '),"")';
    }
    sheet.getRange("B8").setFormula(countFormula(""));
    sheet.getRange("B9").setFormula(countFormula('Visits!$D$2:$D,"Appointment"'));
    sheet.getRange("B10").setFormula(countFormula('Visits!$D$2:$D,"Community activity"'));
    sheet.getRange("B11").setFormula(countFormula('Visits!$D$2:$D,"Other visit"'));
    sheet.getRange("B12").setFormula(countFormula('Visits!$G$2:$G,""'));
    hosts.forEach(function(name, index) {
      var row = hostsHeader + index + 1;
      sheet.getRange(row, 2).setFormula(countFormula('Visits!$D$2:$D,"Appointment",Visits!$E$2:$E,A' + row));
    });
    activities.forEach(function(name, index) {
      var row = activitiesHeader + index + 1;
      sheet.getRange(row, 2).setFormula(countFormula('Visits!$D$2:$D,"Community activity",Visits!$E$2:$E,A' + row));
    });

    sheet.getRange(1, 1, lastRow, 2).setFontFamily("Arial").setFontSize(11).setVerticalAlignment("middle");
    sheet.setColumnWidth(1, 355);
    sheet.setColumnWidth(2, 180);
    sheet.setRowHeights(1, lastRow, 28);
    sheet.setHiddenGridlines(true);
    sheet.getRange("A1:B1").merge().setFontSize(22).setFontWeight("bold").setFontColor("#286247");
    sheet.setRowHeight(1, 42);
    sheet.getRange("A2:B2").merge().setWrap(true).setFontColor("#52675d");
    sheet.setRowHeight(2, 40);
    sheet.getRange("B3:B5").setNumberFormat("dd mmm yyyy");
    sheet.getRange("B3").setBackground("#fff2df").setFontColor("#1f4c91").setNote(
      "Editable: choose any date in the week you want. The report uses Monday to Sunday. Enter =TODAY() for the current week."
    );
    sheet.getRange("B3").setDataValidation(SpreadsheetApp.newDataValidation()
      .requireDate().setAllowInvalid(false).setHelpText("Choose a valid date.").build());
    sheet.getRange("B4:B5").setBackground("#f3f6f1");
    [7, hostsHeader, activitiesHeader].forEach(function(row) {
      sheet.getRange(row, 1, 1, 2).setBackground("#286247").setFontColor("#ffffff").setFontWeight("bold");
    });
    sheet.getRange("B8:B12").setNumberFormat("#,##0");
    sheet.getRange("A8:B8").setFontWeight("bold");
    sheet.getRange("B8").setFontSize(20);
    sheet.getRange(hostsHeader + 1, 2, hosts.length, 1).setNumberFormat("#,##0");
    sheet.getRange(activitiesHeader + 1, 2, activities.length, 1).setNumberFormat("#,##0");
    for (var row = noteRow; row <= lastRow; row++) {
      sheet.getRange(row, 1, 1, 2).merge().setWrap(true).setFontSize(10).setFontColor("#52675d");
      sheet.setRowHeight(row, 42);
    }
    sheet.setFrozenRows(5);
    SpreadsheetApp.flush();
    console.log("Weekly_Summary created. Change B3 to choose a week; totals update from Visits automatically.");
  } finally {
    lock.releaseLock();
  }
}
