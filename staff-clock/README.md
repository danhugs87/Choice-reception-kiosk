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

No public authentication, PIN-change screen, staff clocking API or management web interface is deployed by this stage. The next backend must enforce the initial-PIN change flag and account version before permitting clock actions. Do not collect real time records until the complete staff system has been tested.

Run node staff-clock/check-pins.cjs for mocked HMAC/role/lockout/reset checks. It uses temporary fake credentials, prints no actual PINs and makes no live changes. Visitor reception is unchanged.
