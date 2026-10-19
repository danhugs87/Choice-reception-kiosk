/**
 * Run manually in the Apps Script editor to request any missing permissions.
 * Does not add, edit or delete visits.
 */
function authoriseReception() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email"
  ]);
  diagnoseReception();
}
