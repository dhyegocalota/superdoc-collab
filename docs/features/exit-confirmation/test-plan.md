# Test plan: Exit confirmation while edits are unsynced

- [ ] Open a document, stop the server, wait for the banner, type, click the brand link — expected: the "Leave without your latest edits?" dialog
- [ ] In the dialog click Download — expected: a .docx downloads and the dialog stays
- [ ] Click Stay — expected: dialog closes, URL and typed text unchanged
- [ ] Start the server again, wait for the banner to clear, click the brand link — expected: goes to the list, no dialog
- [ ] Repeat, click Leave while the server is down — expected: goes to the list
- [ ] With the dialog open start the server — expected: the dialog closes by itself and the app navigates once synced
- [ ] While down and after typing, reload the tab — expected: the browser's own leave prompt
- [ ] Click the title, change it, click the brand link — expected: the dialog; Stay, then Cancel on the title, then the brand link — expected: no dialog
- [ ] Type while online, click the brand link — expected: no dialog
- [ ] Open as a reader with the server down — expected: no prompt on reload or navigation
- [ ] Sign out from the account menu while unsynced — expected: the dialog
