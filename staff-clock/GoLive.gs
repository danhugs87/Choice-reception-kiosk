/**
 * Owner-run, one-time changeover after ALL staff records are confirmed fictional.
 * Install and deploy the updated Clock.gs and Staff.html BEFORE running this.
 * All four logs are copied and verified before any working row is cleared.
 * Staff accounts, personal PIN properties and deployment URLs are preserved.
 */
function prepareLiveStaffClock() {
  var ui = SpreadsheetApp.getUi(), checkpoint = null;
  try {
    var owner = scPinOwner_(), ss = owner.ss;
    var properties = PropertiesService.getScriptProperties();
    var existing = properties.getProperty("STAFF_GO_LIVE_CHECKPOINT");
    if (existing) {
      var finished = JSON.parse(existing).phase === "complete";
      if (finished && properties.getProperty("STAFF_LIVE_PREPARED_AT")) {
        ui.alert("Already prepared for live use. No records were changed."); return;
      }
      throw new Error("A previous preparation needs review. Do not remove its checkpoint or retry clearing.");
    }
    if (properties.getProperty("STAFF_LIVE_PREPARED_AT")) {
      throw new Error("Live preparation settings need review. No records were changed.");
    }
    var sources = scStaffLiveSources_(ss);
    var preview = sources.map(function(sheet) {
      return {name: sheet.getName(), rows: sheet.getLastRow(), columns: sheet.getLastColumn(),
        snapshot: JSON.stringify(sheet.getDataRange().getValues()),
        formulas: JSON.stringify(sheet.getDataRange().getFormulas())};
    });
    var answer = ui.prompt("Archive staff tests and start live timekeeping",
      "This will archive " + Math.max(0, preview[0].rows - 1) + " test shifts and the associated work periods, operations and corrections. " +
      "It will then clear ONLY those four working logs. Staff accounts and PINs stay the same.\n\n" +
      "Only proceed if ALL recorded staff hours are fictional tests, nobody is using the staff page, and the updated Clock.gs and Staff.html have been deployed. " +
      "Type TEST ONLY to proceed, or Cancel.", ui.ButtonSet.OK_CANCEL);
    if (answer.getSelectedButton() !== ui.Button.OK || answer.getResponseText().trim() !== "TEST ONLY") return;
    // A spreadsheet prompt suspends execution; reacquire identity and lock.
    owner = scPinOwner_();
    if (owner.ss.getId() !== ss.getId()) throw new Error("The spreadsheet changed. No clearing was attempted.");
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      if (properties.getProperty("STAFF_LIVE_PREPARED_AT") || properties.getProperty("STAFF_GO_LIVE_CHECKPOINT")) {
        throw new Error("Preparation has already started or finished. No new clearing was attempted.");
      }
      sources = scStaffLiveSources_(ss);
      sources.forEach(function(sheet, index) {
        if (sheet.getName() !== preview[index].name || sheet.getLastRow() !== preview[index].rows ||
            sheet.getLastColumn() !== preview[index].columns ||
            JSON.stringify(sheet.getDataRange().getValues()) !== preview[index].snapshot ||
            JSON.stringify(sheet.getDataRange().getFormulas()) !== preview[index].formulas) {
          throw new Error("Records changed during confirmation. Review them before trying again.");
        }
      });
      var started = new Date(), suffix = Utilities.formatDate(started, "Europe/London", "yyyyMMdd_HHmmss");
      checkpoint = {phase: "archiving", startedAt: started.toISOString(), archives: [], cleared: []};
      properties.setProperty("STAFF_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      sources.forEach(function(sheet, index) {
        var archiveName = "Archive_" + sheet.getName() + "_" + suffix;
        if (ss.getSheetByName(archiveName)) throw new Error("An archive with that name already exists; nothing was overwritten.");
        var archived = sheet.copyTo(ss).setName(archiveName);
        SpreadsheetApp.flush();
        if (archived.getLastRow() !== preview[index].rows || archived.getLastColumn() !== preview[index].columns ||
            JSON.stringify(archived.getDataRange().getValues()) !== preview[index].snapshot ||
            JSON.stringify(archived.getDataRange().getFormulas()) !== preview[index].formulas) {
          throw new Error("Archive verification failed. Working records were not cleared.");
        }
        archived.setTabColor("#94a398");
        checkpoint.archives.push({source: sheet.getName(), archive: archiveName, rows: Math.max(0, preview[index].rows - 1)});
        properties.setProperty("STAFF_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      });
      // Verify every original AND backup again immediately before clearing.
      sources.forEach(function(sheet, index) {
        var archived = ss.getSheetByName(checkpoint.archives[index].archive);
        [sheet, archived].forEach(function(current) {
          if (!current || current.getLastRow() !== preview[index].rows || current.getLastColumn() !== preview[index].columns ||
              JSON.stringify(current.getDataRange().getValues()) !== preview[index].snapshot ||
              JSON.stringify(current.getDataRange().getFormulas()) !== preview[index].formulas) {
            throw new Error("Records or archives changed. No clearing was attempted.");
          }
        });
      });
      checkpoint.phase = "clearing verified test logs";
      properties.setProperty("STAFF_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      sources.forEach(function(sheet) {
        var rows = sheet.getLastRow();
        if (rows > 1) sheet.getRange(2, 1, rows - 1, sheet.getLastColumn()).clearContent();
        SpreadsheetApp.flush();
        if (sheet.getLastRow() !== 1) throw new Error("A working log did not clear as expected. Review the archive copies.");
        checkpoint.cleared.push(sheet.getName());
        properties.setProperty("STAFF_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
      });
      ss.rename("Choice Staff Timekeeping");
      SpreadsheetApp.flush();
      // Old test pages must reload before any authenticated live request.
      properties.setProperty("STAFF_DATA_GENERATION", Utilities.getUuid());
      properties.setProperty("STAFF_LIVE_PREPARED_AT", new Date().toISOString());
      checkpoint.phase = "complete";
      properties.setProperty("STAFF_GO_LIVE_CHECKPOINT", JSON.stringify(checkpoint));
    } finally { lock.releaseLock(); }
    console.log("Staff live preparation complete. All test logs were archived and verified. Personal PINs and staff accounts were preserved.");
    ui.alert("Staff tests archived and verified. The four working logs are empty. The spreadsheet is now Choice Staff Timekeeping. " +
      "Close and reopen the staff page before recording genuine working time. Keep your existing links and PINs.");
  } catch (error) {
    console.error("Staff live preparation stopped: " + error.message);
    ui.alert(error.message + (checkpoint ? "\nArchive copies were kept. Clocking stays paused if preparation is incomplete. Ask for review before retrying; do not remove the checkpoint." : ""));
  }
}

function scStaffLiveSources_(ss) {
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty("RECEPTION_SPREADSHEET_ID")) throw new Error("Use the separate staff project, not visitor reception.");
  scValidateHeaders_(ss.getSheetByName("Staff"), SC_HEADERS.Staff);
  return ["Shifts", "Work_Segments", "Operations", "Corrections"].map(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error(name + " is missing.");
    scValidateHeaders_(sheet, name === "Operations" ? SC_OPERATION_HEADERS : SC_HEADERS[name]);
    return sheet;
  });
}
