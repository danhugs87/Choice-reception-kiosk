# Choice staff timekeeping — separate project, stage 1

Confirmed scope:
- Management: Dan, Tracey, Hayley.
- Staff: Tara, Louise.
- Paid breaks: clock in and clock out only; no break deduction.
- Building, occasional home working and off-site work (including meetings before arriving at Choice).
- Changing location should continue the same working day without counting time twice.
- Staff use individual PINs, see their own time records; management will have broader reports and audited corrections.

Stage 1 only creates the data structure. No PIN login, clocking interface, totals or management API is active yet. Later stages must implement and verify those behaviours before any real staff time is recorded.

## Install stage 1

1. Create a NEW blank Google Sheet named Choice Staff Timekeeping - Test. Keep access restricted.
2. From that new file open Extensions > Apps Script. This is a separate bound project from visitor reception.
3. Replace its starter Code.gs with this folder's Code.gs.
4. In Project settings, show appsscript.json in the editor. Replace that file with this folder's manifest.
5. Save, select setupStaffClock and Run. Grant the requested spreadsheet and account identity permissions. Run again if consent interrupts execution.
6. Check Staff contains five accounts with the confirmed roles, and Shifts, Work_Segments and Corrections have headers.
7. Do not deploy yet. Personal PIN setup and the timekeeping backend come next.

The setup refuses the visitor reception project, checks the owner identity, validates existing headers before edits, and preserves existing data and device keys on repeat. PINs will not be stored in GitHub or visible in spreadsheet cells. Management roles do not share the underlying Google Sheet automatically.

The visitor deployment, its private shortcut and all visitor logs are unchanged.

## Development and checks

Source branch: rebuild/staff-clock. Staff project code is in staff-clock; apps-script contains the separate visitor system source.

Run node staff-clock/check-setup.cjs. Tests use mocked Google services, verify roles, paid-break policy, checkbox seeding, repeat setup, record/key preservation and guards. They do not create or edit any live spreadsheet. Confirm layout and account rows in the new Google Sheet after running setup.

## Stage 2: private initial PINs

Add Pins.gs as a Script file named Pins in the staff Apps Script project. Save and manually run setupStaffPins as the spreadsheet owner. It prints each newly generated six-digit initial PIN in the owner's execution log. Save these privately; do not paste the log into chat, GitHub or public messages. Give people only their own code. There is no email distribution action.

Only missing PINs are generated. Rerunning setup preserves existing codes and will not reveal them again. To replace a lost/exposed code, run resetStaffPin from the editor, enter the staff ID in the spreadsheet prompt and save its private replacement code from the execution log. Reset invalidates the previous code and changes its version.

PINs are not written to sheet cells. Script properties contain a distinct per-account salt and HMAC-SHA256 record with a private project pepper, an initial-PIN change requirement, and reset metadata. Actual initial codes are intentionally displayed only in the owner's generation/reset log. These are low-entropy personal PINs with rate limits, not strong identity proof. Keep script-editor access restricted; editors control the source, properties and records.

The private verification helper validates current Staff roles and Enabled flags, returns no PIN/hash/pepper, and locks an account for five minutes after five incorrect attempts. A successful check clears failure state. Changing a PIN will invalidate future version-bound sessions when that layer is implemented.

Stage 2 alone does not deploy a public interface. Stage 3 below adds the PIN-change screen, clocking API and role-checked management overview. Do not collect real time records until the complete staff system has been tested.

Run node staff-clock/check-pins.cjs for mocked HMAC/role/lockout/reset checks. It uses temporary fake credentials, prints no actual PINs and makes no live changes. Visitor reception is unchanged.

## Stage 3: staff clock test application

Install in the STAFF Apps Script project only:
1. Replace Pins.gs with the latest version. This updates a helper; it does not regenerate stored PINs.
2. Add a Script file named Clock and paste Clock.gs.
3. Add an HTML file named Staff and paste Staff.html.
4. Save all files. Manually run setupStaffClockApp as the owner. It validates the data tabs and configured PINs and adds Operations. No email is sent, no working records or existing PINs are reset.
5. Deploy this separate staff project as a NEW web app, execute as Me (the owner), access Anyone. It uses personal PINs for application access.
6. Open its /exec URL. Choose Dan and use the saved initial code. Choose a new six-digit PIN, then sign in with that new PIN. Keep it private.
7. Test clock-in at Choice, location change to Off-site work with a description, clock-out and the weekly views. Check one shift spans its location periods and no time is counted twice. Quick tests may round to 0.00 decimal hours; check the saved timestamps.
8. Do not add this to the reception iPad yet. Visitor integration, staff time corrections and live staff deployment are later stages.

The current app supports building, home and off-site work. No break deduction occurs. It uses Google server timestamps. A location change closes the old work period and starts the next at the same instant within the same shift. Closed periods contribute recorded hours; a still-open period is shown separately as ongoing hours. A long open shift is flagged for review without automatically fabricating an end time.

The weekly view uses Europe/London Monday-to-Monday boundaries and splits elapsed time across weeks, including DST changes. Staff can request only their own time records. Management overview is checked against the CURRENT Staff role after verifying the PIN on every call; client-supplied roles are ignored. The public staff list includes active first names/IDs only.

Initial PINs must be changed before clock actions. Their stored version, enabled flag and role are rechecked after the action lock is acquired. PIN resets therefore invalidate old credentials immediately. PINs are sent only over the Apps Script HTTPS RPC and held in browser memory while that staff screen is unlocked; no PIN/session is stored in localStorage or URL. The screen locks after 60 idle seconds and shortly after a successful clock action. Locking the screen does not clock someone out.

Operations is a durable intent journal, not an additional time ledger to sum. It records a clock request before updating Shifts and Work_Segments. Repeated request IDs are checked against their original staff/action/location/description. Pending operations for an authenticated staff member are resumed before another clock action or state read, using the original timestamp and record IDs. Do not manually clear or edit Pending operations; ask for review if automatic recovery fails. An Applied operation is not duplicated after a lost response.

No PINs or credentials are stored in clock operation rows. Formula-like descriptions are stored as literal text, and displayed using textContent. Hours and work notes are cleared from the screen when locked.

Checks: node staff-clock/check-clock.cjs exercises the actual server functions with fake Sheets/crypto/services, including crashes between writes and same-reference retries. node staff-clock/check-ui.cjs checks screen logic with a DOM stand-in. node staff-clock/check-pins.cjs still passes after the PIN update. None use real credentials or live records. Actual Google calculation/UI rendering, phone/iPad behaviour and final live deployment require manual verification.
