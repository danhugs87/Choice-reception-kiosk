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

The current build does not send practitioner emails. Notifications, a protected manager view, corrections, configurable activity administration and staff timekeeping remain future stages. Do not use this test build as the sole emergency attendance register.

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
