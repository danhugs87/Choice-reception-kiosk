# Reception and staff navigation: iPad test

Status: code checks passed; Home Screen navigation under Apple Guided Access has not been verified on the actual iPad.

1. In the staff Apps Script project, replace Staff.html with this branch's staff-clock/Staff.html. Save and update the existing web-app deployment to a new version. Do not rerun setup or regenerate PINs.
2. In the reception Apps Script project, replace Kiosk.html using apps-script/Kiosk.html from branch rebuild/reception-test. Save and update its existing web-app deployment to a new version. Do not recreate the iPad link.
3. Open reception using the existing private Home Screen bookmark. The staff link appears after the device connects using its bookmark token. A browser paired only with the manually entered manager key does not show this link.
4. Enable Guided Access. Tap Staff clock in / out. Check that staff login opens within the same app without needing to exit Guided Access.
5. Sign in, make a test clock action, then tap Return to visitor reception. Check that reception opens without asking for a key and visitor sign-in/sign-out still works.
6. Reopen staff: its name/PIN login should appear, with no previous staff account unlocked. Test Return to visitor reception from that login screen too.

If a link is blocked or tries to open Safari outside the Home Screen app, this navigation method is not suitable for that iPad setup. End Guided Access and reopen the existing reception bookmark. Restore the previous reception deployment version if needed. Keep staff access separate until a single-page approach is implemented.

The return is a deliberate tap, not an automatic redirect. The staff app still locks after inactivity or seven seconds following a successful clock action; it stays on its PIN screen until Return to visitor reception is tapped.

Security: only the bookmark device token is forwarded, in the URL fragment, to the fixed staff deployment. It is not put in staff RPC requests or browser storage. A manually entered reception manager key is never forwarded. The return destination is fixed in source; arbitrary redirect URLs are not accepted. Returning clears the in-memory staff login. Busy writes block return until their request completes or times out. The private staff-entry URL on the iPad contains its device token; do not share or save it as the normal mobile staff link.

Checks:
- node staff-clock/check-ui.cjs
- node staff-clock/check-navigation.cjs
- node apps-script/check-navigation.cjs (on branch rebuild/reception-test)

These are JavaScript checks with DOM stand-ins, not real iPad browser tests. No attendance records, PINs, or deployments are changed by the source update.
