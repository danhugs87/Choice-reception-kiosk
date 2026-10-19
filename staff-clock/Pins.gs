/**
 * STAFF CLOCK — STAGE 2: INITIAL PRIVATE PIN SETUP.
 * Add to the NEW staff Apps Script project, alongside its Code.gs.
 * Only the spreadsheet owner can generate/reset PINs.
 */
function setupStaffPins() {
  var owner = scPinOwner_();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var accounts = scPinAccounts_(owner.ss);
    var pepper = properties.getProperty("STAFF_PIN_PEPPER");
    var existing = accounts.some(function(account) { return !!properties.getProperty("STAFF_PIN_" + account.id); });
    if (!pepper && existing) throw new Error("Existing PIN records need review. Do not replace the PIN secret.");
    if (!pepper) {
      pepper = Utilities.getUuid() + Utilities.getUuid();
      properties.setProperty("STAFF_PIN_PEPPER", pepper);
    }
    // Validate records before generating any new initial codes.
    accounts.forEach(function(account) {
      var record = properties.getProperty("STAFF_PIN_" + account.id);
      if (record) scParsePinRecord_(record);
    });
    var created = 0;
    accounts.forEach(function(account) {
      if (!account.enabled) return;
      if (properties.getProperty("STAFF_PIN_" + account.id)) {
        console.log(account.name + ": existing PIN retained.");
        return;
      }
      var pin = scGenerateUniquePin_(accounts, properties, pepper);
      scStorePin_(account.id, pin, owner.email, properties, pepper);
      // Intentionally shown once to the owner. Do not paste this log into chat.
      console.log("PRIVATE initial PIN — " + account.name + ": " + pin);
      created++;
    });
    console.log("PIN setup complete. New codes: " + created + ". Save initial PINs privately; do not share the full log.");
    console.log("No clocking screen is deployed yet. Initial PINs will require a change when staff login is added.");
  } finally {
    lock.releaseLock();
  }
}

function resetStaffPin() {
  var owner = scPinOwner_();
  var ui = SpreadsheetApp.getUi();
  var reply = ui.prompt("Reset a staff PIN",
    "Enter staff ID: dan, tracey, hayley, tara or louise. A new initial PIN will replace the old one.",
    ui.ButtonSet.OK_CANCEL);
  if (reply.getSelectedButton() !== ui.Button.OK) return;
  var id = reply.getResponseText().trim().toLowerCase();
  owner = scPinOwner_();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var accounts = scPinAccounts_(owner.ss);
    var account = accounts.filter(function(item) { return item.id === id; })[0];
    if (!account) throw new Error("Staff ID not found. No PIN was changed.");
    var pepper = properties.getProperty("STAFF_PIN_PEPPER");
    if (!pepper) throw new Error("Run setupStaffPins first.");
    var pin = scGenerateUniquePin_(accounts, properties, pepper);
    scStorePin_(account.id, pin, owner.email, properties, pepper);
    console.log("PRIVATE replacement PIN — " + account.name + ": " + pin);
    console.log("The previous PIN is invalid. Keep this new code private.");
  } finally {
    lock.releaseLock();
  }
}

function scPinOwner_() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email"
  ]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var properties = PropertiesService.getScriptProperties();
  var email = Session.getActiveUser().getEmail();
  var owner = ss ? ss.getOwner() : null;
  if (!ss || ss.getId() !== properties.getProperty("STAFF_SPREADSHEET_ID") ||
      !email || !owner || owner.getEmail().toLowerCase() !== email.toLowerCase()) {
    throw new Error("Run this from the staff spreadsheet's Apps Script editor as its owner.");
  }
  return {ss: ss, email: email};
}

function scPinAccounts_(ss) {
  var sheet = ss.getSheetByName("Staff");
  if (!sheet) throw new Error("Staff tab is missing. Run setupStaffClock first.");
  scValidateHeaders_(sheet, SC_HEADERS.Staff);
  var rows = sheet.getDataRange().getValues();
  var ids = {};
  return rows.slice(1).filter(function(row) { return row.some(function(value) { return value !== ""; }); })
    .map(function(row) {
      var id = row[0];
      if (typeof id !== "string" || !/^[a-z0-9_-]{1,32}$/.test(id) || ids[id] ||
          !row[1] || (row[2] !== "Management" && row[2] !== "Staff")) {
        throw new Error("Staff IDs or roles need checking. No PIN setup changes were made.");
      }
      ids[id] = true;
      return {id: id, name: String(row[1]), role: row[2], enabled: row[4] === true};
    });
}

function scGenerateUniquePin_(accounts, properties, pepper) {
  for (var attempt = 0; attempt < 30; attempt++) {
    var random = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
    var pin = String(100000 + (parseInt(random, 16) % 900000));
    var used = accounts.some(function(account) {
      var raw = properties.getProperty("STAFF_PIN_" + account.id);
      if (!raw) return false;
      var record = scParsePinRecord_(raw);
      return scEqualPinHash_(record.hash, scPinHash_(account.id, pin, record.salt, pepper));
    });
    if (!used) return pin;
  }
  throw new Error("Unable to generate a distinct code. Please try again.");
}

function scStorePin_(id, pin, actor, properties, pepper, requireChange) {
  var salt = Utilities.getUuid();
  properties.setProperty("STAFF_PIN_" + id, JSON.stringify({
    salt: salt, hash: scPinHash_(id, pin, salt, pepper),
    version: Utilities.getUuid(), mustChange: requireChange !== false,
    changedAt: new Date().toISOString(), changedBy: actor
  }));
  properties.deleteProperty("STAFF_PIN_ATTEMPTS_" + id);
}

function scParsePinRecord_(raw) {
  var record = JSON.parse(raw);
  if (!record || typeof record.salt !== "string" || !record.salt ||
      typeof record.hash !== "string" || !/^[a-f0-9]{64}$/.test(record.hash) ||
      typeof record.version !== "string" || !record.version) {
    throw new Error("A PIN record needs owner review.");
  }
  return record;
}

function scPinHash_(id, pin, salt, pepper) {
  return Utilities.computeHmacSha256Signature(id + ":" + salt + ":" + pin, pepper, Utilities.Charset.UTF_8)
    .map(function(value) { return ("0" + ((value + 256) % 256).toString(16)).slice(-2); }).join("");
}

function scEqualPinHash_(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/**
 * Private authentication helper for the next stage. Five failed attempts lock
 * an account for five minutes. No PIN, hash or pepper is returned or logged.
 */
function scVerifyPin_(id, pin) {
  var lock;
  var denied = {ok: false, message: "PIN not accepted. Check the code or ask a manager."};
  try {
    if (typeof id !== "string" || !/^[a-z0-9_-]{1,32}$/.test(id)) return denied;
    var properties = PropertiesService.getScriptProperties();
    var spreadsheetId = properties.getProperty("STAFF_SPREADSHEET_ID");
    var pepper = properties.getProperty("STAFF_PIN_PEPPER");
    if (!spreadsheetId || !pepper) return denied;
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var accounts = scPinAccounts_(SpreadsheetApp.openById(spreadsheetId));
    var account = accounts.filter(function(item) { return item.id === id; })[0];
    if (!account || !account.enabled) return denied;
    var raw = properties.getProperty("STAFF_PIN_" + id);
    if (!raw) return denied;
    var record = scParsePinRecord_(raw);
    var attemptKey = "STAFF_PIN_ATTEMPTS_" + id;
    var state = JSON.parse(properties.getProperty(attemptKey) || '{"failures":0,"lockedUntil":0}');
    var now = Date.now();
    if (state.lockedUntil > now) {
      return {ok: false, message: "Too many attempts. Please wait five minutes or ask a manager."};
    }
    if (state.lockedUntil) state = {failures: 0, lockedUntil: 0};
    var accepted = typeof pin === "string" && /^[0-9]{6}$/.test(pin) &&
      scEqualPinHash_(record.hash, scPinHash_(id, pin, record.salt, pepper));
    if (!accepted) {
      state.failures++;
      if (state.failures >= 5) state.lockedUntil = now + 5 * 60 * 1000;
      properties.setProperty(attemptKey, JSON.stringify(state));
      return state.lockedUntil ?
        {ok: false, message: "Too many attempts. Please wait five minutes or ask a manager."} : denied;
    }
    properties.deleteProperty(attemptKey);
    return {ok: true, staffId: account.id, name: account.name, role: account.role,
      mustChange: record.mustChange === true, pinVersion: record.version};
  } catch (error) {
    console.error("Staff PIN check unavailable.");
    return {ok: false, message: "Unable to check the PIN. Please ask a manager."};
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

