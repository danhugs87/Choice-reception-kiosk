# Choice staff timekeeping

Confirmed scope:
- Management: Dan, Tracey, Hayley.
- Staff: Tara, Louise.
- Paid breaks: clock in and clock out only; no break deduction.
- Building, occasional home working and off-site work (including meetings before arriving at Choice).
- Changing location should continue the same working day without counting time twice.
- Staff use individual PINs, see their own time records; management will have broader reports and audited corrections.

Current implementation includes PIN login, paid-hours reporting, work locations, management correction of missed clock-outs and reception navigation. The owner has verified the visitor/staff links and locked-screen privacy on the iPad under Apple Guided Access. The install stages below document the original build sequence. Staff records are currently fictional tests; the one-time live preparation below archives them before genuine use.

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

## Stage 4: management correction of missed clock-outs

In the staff Apps Script project:
1. Replace Clock.gs and Staff.html with the current versions.
2. Add a Script file named StaffCorrections and paste StaffCorrections.gs.
3. Save, run setupStaffCorrections as the owner, then update the existing STAFF deployment to a new version (execute as owner).
4. Existing personal PINs and records are preserved. Do not rerun PIN generation.

Management users sign in with their own PIN, open Management weekly overview > Correct a missed clock-out, choose an open shift, enter a confirmed actual UK finish date/time and a reason explaining how it was confirmed, then confirm. Date format is dd/MM/yyyy HH:mm, optionally with :ss seconds. There is no current-time default. A finish before the latest location period or in the future is rejected. If the actual time is unknown, leave it open for review; no hours are invented.

Dan, Tracey and Hayley are permitted based on the CURRENT Staff role after PIN authentication. Tara/Louise cannot access either correction endpoint, even if they change client-side role fields.

A correction closes the final work period and its shift with status Closed - staff correction. Prior completed location periods are preserved. Corrections stores the original and intended shift/period snapshots, author staff ID, reason, actual finish and separate correction timestamp. Earlier clock Operations are preserved as historical events.

The audit is Pending before time rows change, then Applied after both writes complete. Retrying the same correction reference verifies its original details. Already-authorised Pending corrections can resume on management-list loading or that staff member's next authenticated state read. This completes the original approved intent, not a new correction. A record changed since the original snapshot is refused for owner review; it is not overwritten.

An unfinished staff clock operation must be recovered by that staff member before management can correct the shift. Pending operations are flagged in the open-shift picker.

Live test: clock Dan in, note the actual finish after at least a minute, lock the page without clocking out, sign back in, use the management correction form and supply the confirmed finish and reason Testing missed clock-out. Check Shifts and the last Work_Segments row close at that supplied time, and Corrections has one Applied audit record retaining originals.

This stage corrects OPEN shifts with known actual finish times. Corrections to existing closed shifts, missing clock-ins, and review/approval of timesheets remain separate future work if required.

The check-clock integration suite now includes role denial, invalid/future/early finishes, original snapshots, partial write/marker failure recovery, pending-operation blocks and refusal to overwrite edited rows. The check-ui suite includes the correction form and same-reference retry. These use mocked services and a DOM stand-in; actual browser/Google deployment remains a live check.

## Reception iPad navigation

Use the existing private reception Home Screen bookmark. Staff clock in / out opens this separate staff deployment; Return to visitor reception clears the in-memory staff login before returning. The owner confirmed both directions work under Apple Guided Access and that reopening staff requires a fresh PIN. The normal mobile staff link has no reception token. See IPAD-NAVIGATION.md for the implementation and checks.

## Stage 5: archive fictional tests and start live staff timekeeping

Only do this once ALL recorded staff time is confirmed fictional. Do not use this procedure to delete or reset genuine hours.

1. In the STAFF project replace Clock.gs and Staff.html with these latest files. Add a Script file named GoLive and paste GoLive.gs.
2. Save, then update the EXISTING staff web deployment to a new version. This deployment must happen BEFORE running preparation, so the request gate and page-generation checks are active.
3. Nobody should use the staff page while preparation runs. Run prepareLiveStaffClock manually from the bound editor as the spreadsheet owner. Switch back to the spreadsheet if its confirmation dialog is not visible.
4. Review the prompt and type TEST ONLY only if all entries are fictional and the new code has been deployed.
5. The function copies Shifts, Work_Segments, Operations and Corrections into timestamped Archive_ tabs. All values and formulas are checked against the original snapshots before ANY working data row is cleared. It also rechecks the originals and archives immediately before clearing.
6. It clears only the four working logs, preserving headings and formatting. Staff accounts and all PIN/pepper/device settings are unchanged. It renames the file Choice Staff Timekeeping.
7. Close and reopen staff on the iPad using its existing reception link. The test banner is replaced after the successful live marker; no second deployment is needed. Sign in and check recorded/ongoing hours start at zero. Make a genuine clock-in only at the actual start of work; this system does not backdate it automatically.

The script records a durable preparation checkpoint before copying. An incomplete checkpoint stops staff RPCs, including recovery writes. If copying fails, no logs are cleared; if later clearing/renaming/marker writing fails, the verified archives stay available. Do not remove checkpoints or rerun clearing blindly: review any interrupted operation first.

A new data-generation identifier is saved at changeover. Already-open staff pages and pending test requests are rejected after go-live, even with a valid PIN. Reloading the page or Retry loading staff obtains the new generation; this avoids turning an old test clock-in retry into a genuine shift after Operations has been emptied. The request gate is checked both before access and after acquiring the action lock.

A successful repeat preparation call does nothing. The spreadsheet owner runs this once from the editor; no public RPC exposes archive/clear actions. Visitor records, reception credentials and deployments are untouched.

Checks: node staff-clock/check-golive.cjs, node staff-clock/check-clock.cjs, node staff-clock/check-ui.cjs and node staff-clock/check-navigation.cjs. These verify backups before clearing, cancellation/owner/layout guards, PIN/account preservation, failed archive/clear/rename/final markers, repeat protection, maintenance races, stale request rejection and page refresh. They use fake services and records; actual Apps Script copies, prompts, deployment updates and the post-changeover iPad check remain manual.
