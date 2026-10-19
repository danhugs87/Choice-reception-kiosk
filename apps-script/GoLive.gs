/**
 * Owner-run one-time transition from fictional test data to live attendance.
 * Copies and verifies all test logs before clearing working data rows.
 * Does not rotate device credentials or send emails.
 */
function prepareLiveReception() {
  var ui = SpreadsheetApp.getUi();
  var checkpoint;
  try {
    var context = staffContext_(true);
    var ss = context.ss;
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("RECEPTION_LIVE_PREPARED_AT")) {
      ui.alert("Already prepared for live use. No records were changed.");
      return;
    }
    if (properties.getProperty("RECEPTION_GO_LIVE_CHECKPOINT")) {
      throw new Error("A previous preparation needs review. No further records were changed. Ask for help before retrying.");
    }
    var sources = livePreparationSources_(ss);
    var preview = sources.map(function(sheet) {
      return {name: sheet.getName(), rows: sheet.getLastRow(), columns: sheet.getLastColumn(), snapshot: JSON.stringify(sheet.getDataRange().getValues())};
    });
    var visitsCount = Math.max(0, preview[0].rows - 1);
    var response = ui.prompt(
      "Archive fictional tests and start live attendance",
      "This will archive " + visitsCount + " test visits and the associated alert/correction logs, then clear their working data rows. " +
      "Weekly totals will start from zero.\n\nOnly proceed if ALL entries are fictional tests and nobody is using the kiosk right now. " +
      "Type TEST ONLY to proceed, or Cancel.",
      ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() !== ui.Button.OK || response.getResponseText().trim() !== "TEST ONLY") return;
    // Prompts release locks; verify again after the confirmation.
    context = staffContext_(true);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (properties.getProperty("RECEPTION_LIVE_PREPARED_AT") ||
          properties.getProperty("RECEPTION_GO_LIVE_CHECKPOINT")) {
        throw new Error("Preparation has already started or finished. No new clearing was attempted.");
      }
      sources = livePreparationSources_(ss);
      sources.forEach(function(sheet, index) {
        if (sheet.getLastRow() !== preview[index].rows || sheet.getLastColumn() !== preview[index].columns ||
            JSON.stringify(sheet.getDataRange().getValues()) !== preview[index].snapshot) {
          throw new Error("Records changed during confirmation. Review the logs before trying again.");
        }
      });
      var started = new Date();
      var suffix = Utilities.formatDate(started, "Europe/London", "yyyyMMdd_HHmmss");
      checkpoint = {phase: "archiving", startedAt: started.toISOString(), archives: [], cleared: []};
      properties.setProperty("RECEPTION_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      // Every source is copied and value-checked before ANY source is cleared.
      sources.forEach(function(sheet) {
        var archiveName = "Archive_" + sheet.getName() + "_" + suffix;
        if (ss.getSheetByName(archiveName)) throw new Error("Archive name already exists. No overwrite attempted.");
        var originalValues = sheet.getDataRange().getValues();
        var archived = sheet.copyTo(ss).setName(archiveName);
        SpreadsheetApp.flush();
        if (archived.getLastRow() !== sheet.getLastRow() ||
            archived.getLastColumn() !== sheet.getLastColumn() ||
            JSON.stringify(archived.getDataRange().getValues()) !== JSON.stringify(originalValues)) {
          throw new Error("Archive verification failed. Working records were not cleared.");
        }
        archived.setTabColor("#94a398");
        checkpoint.archives.push({source: sheet.getName(), archive: archiveName, rows: originalValues.length - 1});
        properties.setProperty("RECEPTION_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      });
      checkpoint.phase = "clearing verified test logs";
      properties.setProperty("RECEPTION_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      sources.forEach(function(sheet) {
        var rows = sheet.getLastRow();
        if (rows > 1) sheet.getRange(2, 1, rows - 1, sheet.getLastColumn()).clearContent();
        SpreadsheetApp.flush();
        if (sheet.getLastRow() !== 1) throw new Error("A working log did not clear as expected. Check the archives.");
        checkpoint.cleared.push(sheet.getName());
        properties.setProperty("RECEPTION_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      });
      var summary = ss.getSheetByName("Weekly_Summary");
      if (!summary) throw new Error("Weekly summary is missing. Archived test records remain safe.");
      summary.getRange("B3").setFormula("=TODAY()");
      var notes = summary.getRange(1, 1, Math.min(summary.getMaxRows(), 50), 1).getValues();
      notes.forEach(function(row, index) {
        if (row[0] === "TEST REPORT: includes fictional visits recorded during setup.") {
          summary.getRange(index + 1, 1).clearContent();
        }
      });
      ss.rename("Choice Reception - Attendance");
      SpreadsheetApp.flush();
      checkpoint.phase = "complete";
      properties.setProperty("RECEPTION_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      properties.setProperty("RECEPTION_LIVE_PREPARED_AT", new Date().toISOString());
    } finally {
      lock.releaseLock();
    }
    console.log("Live preparation complete. Test records are preserved in Archive_ tabs.");
    ui.alert("Test logs archived and verified. Working logs are empty and the spreadsheet is now Choice Reception - Attendance. " +
      "Next update the existing web deployment to remove the test banner. Keep the existing iPad shortcut.");
  } catch (error) {
    console.error("Live preparation stopped. " + error.message);
    ui.alert(error.message + (checkpoint ?
      "\nArchive copies were kept. Do not rerun or remove the checkpoint without reviewing the logs." : ""));
  }
}

function livePreparationSources_(ss) {
  var visits = ss.getSheetByName("Visits");
  var alerts = ss.getSheetByName("Arrival_Alerts");
  var corrections = ss.getSheetByName("Visit_Corrections");
  validateHeaders_(visits);
  validateAlertHeaders_(alerts);
  validateCorrectionHeaders_(corrections);
  if (!ss.getSheetByName("Weekly_Summary")) throw new Error("Weekly_Summary is missing.");
  return [visits, alerts, corrections];
}
