# Choice Reception test rebuild

This branch is a work in progress. The original main branch and live reception kiosk are unchanged.
GitHub stores the source. Apps Script serves the new kiosk and writes to the separate test spreadsheet.

## Install or update the test app

1. Open Extensions > Apps Script from Choice Reception - Test.
2. Replace Code.gs with this folder's Code.gs.
3. Add an HTML file named Kiosk (Apps Script supplies the .html extension) and paste Kiosk.html into it.
4. Save both files. For initial setup, run setupReception from the editor. Running it again preserves visits and the existing key.
5. Deploy as a web app, executing as the owner. Anonymous access is required for visitors; all record access separately requires the private device key.
6. For an existing deployment: Deploy > Manage deployments > select the test web app > Edit (pencil) > Version: New version > Deploy. Keep using that deployment's /exec URL.
7. Open Project settings (gear) > Script properties and copy the value of KIOSK_KEY. Enter it into the app's Connect this device screen in the intended browser.
8. Do not publish the key in GitHub, paste it into chat, add it to the URL, or share it with visitors. The key permits kiosk record access; it is not a staff manager login. Rotate it in Script properties if exposed.

The key is remembered using browser local storage when available. Browser restrictions or clearing website data may require pairing again. Test this on the actual iPad.

## Features in this test version

- Appointment, community activity and other-visit sign-in.
- Optional car registration; no email collection.
- Name-based lookup returns matching open visits from today in Europe/London, not a full visitor directory.
- Confirm sign-out for the selected unique visit.
- Multiple visits with the same name appear separately with arrival time, destination and optional registration suffix.
- Each sign-in has a request reference. Retrying an unconfirmed action on the error screen reuses it. Do not refresh or start a new sign-in after a connection error; ask staff if unsure.
- Arrival and departure are stored as real dates in one row per visit.
- Unclosed older visits remain in the sheet for later staff review; this version does not claim an exact current headcount.
- Inactive forms clear after 90 seconds. Unconfirmed mutations retain their reference for retry while clearing visible identity fields.

Practitioner email alerts are available after setupArrivalAlerts is enabled. Spreadsheet-based staff corrections are available after setupStaffTools. A separate manager web view, configurable activity administration and staff timekeeping remain future stages. Do not use this test build as the sole emergency attendance register.

## Test before moving the reception iPad

Use fictional records only:
- Sign in for each of the three visit types. Check the correct sheet row, arrival and optional registration.
- Sign out and check departure is written to that same row, without adding a second row.
- Create two visits with the same name, select one, and check only that visit closes.
- Try a name without an open visit.
- Test device pairing, a page reload, portrait and landscape orientation, and the on-screen keyboard on the actual iPad.
- After an interrupted submission, use the same-action retry and check for duplicate rows.
- Leave a form idle and check personal fields clear.

Run node apps-script/check-logic.cjs after checking out this branch. These are DOM-stand-in flow tests with mocked RPC responses, not browser rendering or live Google integration tests. Backend logic was separately checked with mocked Apps Script services. The attempted local browser test was unavailable because its browser runtime could not be downloaded.

## iPad Home Screen fallback when local storage does not persist

Keep the existing deployed appearance while design work is deferred.

1. Replace Code.gs and Kiosk.html in the test Apps Script editor with the latest files in this branch, then save.
2. Update the existing test deployment to a new version (execute as owner).
3. From the editor, run createIpadLink. It prints an intentionally private URL in your execution log. Do not paste that log/link into chat, GitHub or public messages.
4. Transfer the private link to your iPad yourself, open it in Safari, then add that exact URL to the Home Screen. Ensure the saved URL retains its #device= fragment. Replace the old shortcut.
5. Close and reopen twice from the new icon and check that it connects without requesting the manager key. Then test one fictional arrival/departure.

The private URL contains a separate device credential, not KIOSK_KEY, and grants the same kiosk operations as the paired visitor device. It is intentionally available to anyone with physical access to that bookmark. Keep the device and link controlled. Its fragment is read using google.script.url.getLocation. The backend stores only the device-token hash. Generating a new link invalidates the previous device link; the existing manager key remains valid. It does not revoke earlier manager-key pairings.

This bypasses reliance on browser storage; actual Home Screen fragment preservation still requires an iPad check. No tracking-protection changes are required. The private link is intentionally logged only when the owner manually runs createIpadLink; routine visitor requests never log it.

Run node apps-script/check-device.cjs for token generation, revocation and guard checks. The UI flow checks also simulate repeated launches with localStorage unavailable.

## Weekly attendance summary

Add Reports.gs as a separate Script file named Reports in the existing test Apps Script project. Save and manually run setupWeeklySummary. No web-app redeployment or iPad shortcut changes are needed.

This creates Weekly_Summary without changing Visits. If the tab already exists, setup leaves it unchanged. The report checks the editor identity, connected spreadsheet, Visits headers and Europe/London spreadsheet time zone before creating anything.

B3 is the editable date selector, initially =TODAY(). Choose any date to show its Monday–Sunday week. Restore =TODAY() to follow the current week. Formula totals update as Visits receives new records.

The report counts visits by arrival time, not unique people, appointments booked or completed appointments. An arrival on Sunday is included until, but not including, next Monday at midnight. A visit leaving the following week is counted in its arrival week. No departure recorded is based on the selected week's arrivals with a blank departure, so it is not a current building headcount.

Check the initial total against the test rows in Visits, change B3 to a week with no records, restore the current week, and make one fictional sign-in to confirm the total increases by one. Its sign-out should keep total visits unchanged and reduce the no-departure count by one. Visually check the date selector, headings and counts in Google Sheets.

Run node apps-script/check-reports.cjs for formula-fixture and setup-guard checks. These do not replace live Google Sheets calculation and visual verification.

## Appointment arrival email alerts

Recipients are the five exact addresses from the original script, confirmed by the owner: tara, louise, tracey, hayley and dan at choicewellbeingservice.org. There is no fallback or community-activity recipient.

Install the latest Code.gs and appsscript.json in the existing test Apps Script project. Save both. Manually run setupArrivalAlerts and grant spreadsheet, identity and send-email permissions. Setup only checks quota and creates the Arrival_Alerts audit tab; it sends no mail. Then update the existing web-app deployment to a new version, executing as the owner. The existing iPad shortcut remains valid. Do not run createIpadLink as part of this update.

For the live test, sign in one fictional Appointment with Dan, then check dan@choicewellbeingservice.org including junk mail and Arrival_Alerts. Subject: Choice reception: your appointment has arrived. The body contains the visitor's name and UK arrival timestamp; no registration or visitor email is included. Check one community visit creates no email attempt.

Attendance is saved and flushed before attempting an alert. Attempts are recorded before sending. Successful service calls are labelled Submitted, which does not prove inbox delivery. Quota exhaustion is Not sent; interrupted sending is Not confirmed, requiring an inbox check. A retained Sending state also requires a manual check. Do not automatically resend an uncertain email.

Saved-request retries never resend alerts. A failure or process interruption between attendance saving and the mail attempt can result in a missed notification. Alerts are best-effort; the attendance log is the authoritative visit record. Existing visits are not emailed retrospectively.

Set the ARRIVAL_ALERTS_ENABLED Script property to false to disable new email alerts without disabling visitor sign-in.

Run node apps-script/check-alerts.cjs for mocked mail/backend integration checks. No real emails are sent by the test suite.

## Staff correction of forgotten sign-outs

Add StaffTools.gs as a separate Script file named StaffTools in the connected test Apps Script editor. Save and run setupStaffTools as the spreadsheet owner. It creates Visit_Corrections and adds a Reception menu to the spreadsheet. Refresh the Google Sheet if the menu does not appear. No web app deployment or private iPad link regeneration is required.

In Visits, select any cell within ONE open visitor row, then Reception > Close selected visit. Enter the reason/evidence. Enter a confirmed actual departure as dd/MM/yyyy HH:mm in UK time, or leave blank if unknown. Check the confirmation before applying. Cancel if the person may still be inside.

Known departures are marked Signed out - staff correction. Unknown times stay blank and the status becomes Closed by staff - time unknown. The correction log retains operator account, correction time, original/new status, departure values, reason and result. Unknown departures still count under No departure recorded in the weekly report; closing a visit does not establish its departure time.

The owner is allowed by default. The owner may configure STAFF_MANAGER_EMAILS in Script properties as a comma-separated list of additional approved manager email addresses; each also needs access to edit the spreadsheet. This uses the existing restricted Google Sheet, not a separate tamper-proof role system: spreadsheet/script editors can edit underlying data and source. Public kiosk requests cannot invoke private helpers, and manager entry points verify a signed-in allowed editor and the connected spreadsheet.

The record is re-found by stable visit ID after the dialogs and under the same lock as kiosk changes. If it has changed or already closed, the correction stops. A Pending audit entry is saved before any visit change. Applied confirms completion; Pending or Not confirmed requires checking both records before another correction.

Live test: create one fictional community visit, then close it from the spreadsheet with reason Testing forgotten sign-out and unknown time. Check the departure stays blank, the status changes, and Visit_Corrections contains an Applied row with the correct account and separate correction timestamp.

Run node apps-script/check-staff.cjs for mocked date, access, concurrency and write-failure checks. Verify the actual sheet menu and prompts manually.

## Transition from fictional tests to everyday attendance

The owner confirmed that all entries in the connected test spreadsheet are fictional. Live preparation has been coded and locally checked but is not performed by changing GitHub.

1. Replace Code.gs and Kiosk.html in Apps Script with the current versions. Add GoLive.gs as a Script file named GoLive. Save. Do not redeploy the web app yet.
2. Stop using the kiosk during preparation. Run prepareLiveReception from the editor and return to the spreadsheet for its confirmation prompt. Type TEST ONLY only if every current record is fictional.
3. The script copies Visits, Arrival_Alerts and Visit_Corrections to timestamped Archive_ tabs in the same spreadsheet. It verifies every copy before clearing any working data rows. Headers and formats remain. It resets the weekly selector to the current week, removes the known test footer, and renames the workbook Choice Reception - Attendance.
4. Verify the three working logs contain headers only and Archive_ tabs retain the test data. The weekly total should be zero.
5. Only after preparation succeeds, update the existing web-app deployment to a new version (execute as owner). Reopen the existing private iPad shortcut and verify the test banner is gone. Do not run createIpadLink or rotate any keys.

Spreadsheet identity, device credentials and notification settings are preserved. Old original attendance files outside this connected test spreadsheet are untouched. Archive tabs remain visible for review.

RECEPTION_LIVE_PREPARED_AT prevents accidental repeats. RECEPTION_GO_LIVE_CHECKPOINT tracks copies and clearing; if preparation stops, do not remove that property or rerun until the archive and working logs are reviewed. This protects subsequent real attendance from a repeated test-data reset.

Run node apps-script/check-golive.cjs for archive-first ordering, copy verification failure, concurrent edit, partial clearing, cancellation, repeat and credential preservation checks. These use mocked Sheets and do not alter live records. The existing visitor, device, reports, email and correction checks also pass after the live-title changes.
