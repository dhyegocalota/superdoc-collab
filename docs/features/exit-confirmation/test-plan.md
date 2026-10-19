# Test plan: Exit confirmation while edits are unsynced

- [ ] Open a document, stop the server, wait for the banner, type, click the brand link — expected: the "Leave without your latest edits?" dialog — BLOCKED: the socket runs in a worker; browser offline emulation and routeWebSocket do not cut it (no banner after 6 s offline), and the stack is not stopped by instruction; the dirty-title path below drives the same dialog
- [x] In the dialog click Download — expected: a .docx downloads and the dialog stays — evidence: dirty title, brand link: dialog "Leave without your latest edits?" with Stay, Download, Leave; Download gave "Saved by enter.docx", dialog stayed open, URL unchanged; screenshot .pr-media/testing/exit-confirmation-dialog-1280.png
- [x] Click Stay — expected: dialog closes, URL and typed text unchanged — evidence: Stay closed the dialog, URL unchanged, title input kept "Dirty title"
- [ ] Start the server again, wait for the banner to clear, click the brand link — expected: goes to the list, no dialog — BLOCKED: needs a stopped server (see the first box)
- [x] Repeat, click Leave while the server is down — expected: goes to the list — evidence: tested with a dirty title instead of a down server: Leave went to /documents; browser Back returned to the document with the editor and no open title input
- [ ] With the dialog open start the server — expected: the dialog closes by itself and the app navigates once synced — BLOCKED: needs a stopped server (see the first box)
- [ ] While down and after typing, reload the tab — expected: the browser's own leave prompt — BLOCKED: needs a stopped server (see the first box)
- [x] Click the title, change it, click the brand link — expected: the dialog; Stay, then Cancel on the title, then the brand link — expected: no dialog — evidence: dialog shown; Stay kept the draft; Cancel on the title then brand link navigated to /documents with no dialog
- [x] Type while online, click the brand link — expected: no dialog — evidence: typed "!" online, brand link went to /documents with no dialog
- [ ] Open as a reader with the server down — expected: no prompt on reload or navigation — BLOCKED: needs a stopped server (see the first box)
- [x] Sign out from the account menu while unsynced — expected: the dialog — evidence: dirty title then Account, Sign out: the same dialog, URL unchanged, Stay kept the draft "Dirty for signout"; screenshot .pr-media/testing/exit-confirmation-sign-out-1280.png

## Edge cases found during execution

- Browser Back with a dirty title is blocked with the dialog (history pop, 500 ms after typing), Stay keeps the draft.
- Race: fill the title and press Back in the same task (no frame between them, as a script does) leaves without the dialog and loses the draft; with 500 ms between them the dialog shows. Not reachable by a human, low severity: the dirty flag arms after a render, not synchronously.
