# Test plan: Word-like keyboard shortcuts

## The failing test first

- [x] `shortcuts.test.ts::every command entry names a catalogued SuperDoc command` — expected: the registry's command ids are all in the installed catalog (`BUILT_IN_COMMAND_IDS` holds only 16 ids, so the test reads the ids of `COMMAND_CATALOG` from the installed declaration file)
- [x] Confirmed it fails for the right reason (commit bce34167, stub registry empty): `AssertionError: expected [] to deeply equal [ 'align-center', …(27) ]` in the registry test, and `expected 0 to be greater than 0` for the command ids

## Unit

- [ ] registry: both platforms per id; no duplicate combos per platform; groups cover every id
- [ ] platform helper: Mac from `navigator.platform` and from `userAgentData`; other otherwise
- [ ] `use-shortcuts`: resolves per platform; ignores `defaultPrevented`; skips text fields; `preventDefault` only when handled; reader inert for formatting
- [ ] `ShortcutHint`: ⌘⇧L on Mac, Ctrl+Shift+L elsewhere
- [ ] `ShortcutsDialog`: groups, search filter, opened by ⌘/, `?`, account menu, More actions; reader groups only
- [ ] hints present in the download menu items, Find, More actions, Share, title Save and Cancel tooltips

## E2E

- [ ] `e2e/shortcuts.spec.ts`: ⌘B bolds the typed word (toolbar bold active); ⌘⌥1 makes a heading; ⌘S downloads the DOCX; ⌘/ opens the modal and typing filters it; the download menu shows ⌘S and ⌘P hints

## Prove it for real — Playwright MCP

- [x] New document: type, ⌘B, ⌘I, ⌘U, ⌘E, ⌘⇧L, ⌘⌥2, ⌘M; each visibly applies; ⌘Z undoes — evidence: computed styles after each key and after ⌘Z, bold 700 to 400, italic, underline, centre, right (⌘R), justify (⌘J, rewrapped to full width), ⌘⇧8 bullet marker, ⌘⌥2 17.3 px, ⌘M indent 48 px, ⌘⇧M back to 0; all undone by ⌘Z; .pr-media/testing2/shortcuts-b-1280.png, shortcuts-i-1280.png, shortcuts-u-1280.png, shortcuts-e-1280.png, shortcuts-r-1280.png, shortcuts-j-1280.png, shortcuts-bullets-1280.png, shortcuts-heading2-1280.png, shortcuts-indent-1280.png, shortcuts-outdent-1280.png, shortcuts-l-1280.png (⌘L and ⌘⇧L: ⌘L is align left, bullets are ⌘⇧8 per the briefing); also ⌘⌥1, ⌘⇧N, ⌘⇧7, ⌘⇧X verified
- [x] ⌘/ then search "head" shows the heading rows; Esc closes; account menu → Keyboard shortcuts opens it — evidence: dialog text after filtering is Paragraph, Heading 1, Heading 2, Heading 3 only; "zzzz" shows "No shortcuts match your search."; Esc closes and focus returns to the editor input; account menu and More actions entries open it; .pr-media/testing2/shortcuts-modal-filter-head-1280.png, shortcuts-account-menu-1280.png, shortcuts-modal-windows-keys-1280.png
- [x] Hover Download, Find and, while editing the title, Save and Cancel: the tooltip shows the hint (Save shows Enter, Cancel shows Esc); open the download menu: hints right-aligned — evidence: second walk: Download and Find tooltips show their hints, the title tooltips read "Save Enter" and "Cancel Esc" (.pr-media/testing2/title-row-edit-state-1280.png); Share and More actions have no key by design
- [x] Reader: no formatting rows, keys inert — evidence: reader dialog groups are Navigation, Document, App only; after ⌘A, ⌘E ⌘B ⌘⌥2 ⌘⇧8 ⌘M nothing changed (alignment, weight, indent, bullets); .pr-media/testing2/shortcuts-reader-modal-1280.png
- [x] 375 px: the modal scrolls, no horizontal scroll — evidence: dialog 343 px wide inside 375, scrollWidth 326 equals clientWidth, document scrollWidth 375, inner scroll 0 to 857; .pr-media/testing2/shortcuts-modal-375.png, shortcuts-modal-scrolled-375.png, shortcuts-modal-filter-375.png, shortcuts-editor-375.png

- [ ] Select a word, ⌘⌥M: the composer opens, a comment is added and shows on the page; with nothing selected the comment anchors to the caret — FAILED for the second half: with the word "beta" selected the "Add comment" dialog opened, Comment added "First comment on the word" and the card and highlight showed on the page (.pr-media/testing2/shortcuts2-comment-composer-1280.png, .pr-media/testing2/shortcuts2-comment-added-1280.png); with nothing selected (a collapsed caret, a fresh load, or the body focused after a click on the grey page area) the dialog opened, Comment closed it and a comment anchored to a point marker (a zero-width character, `data-comment-point-marker`) appeared; no alert was ever shown (.pr-media/testing2/shortcuts2-comment-no-selection-alert-1280.png, .pr-media/testing2/shortcuts2-comment-blurred-editor-1280.png)
- [x] ⌘⌥= and ⌘⌥-: the page zooms through the steps; ⌘⌥E opens and closes the edits panel; ⌘⌥S summarizes — evidence: zoom in 125, 150, 200 and stops; zoom out 150, 125, 100, 90, 75, 50 and stops (page width 1020, 1224, 1632 and 1224, 1020, 816, 734, 612, 408); ⌘⌥E opened the panel (separator present) and a second press closed it; ⌘⌥S sent POST /summaries/selection and "Summary of these edits" appeared; .pr-media/testing2/shortcuts2-zoom-in-1280.png, .pr-media/testing2/shortcuts2-zoom-out-1280.png, .pr-media/testing2/shortcuts2-edits-panel-open-1280.png, .pr-media/testing2/shortcuts2-summarize-1280.png
- [x] Hold ⌘B on a selection: bold toggles once, not on every repeat (same for ⌘S: one download) — evidence: three runs of 30 keydowns (29 repeats, about 1 s each) on a triple-click selection gave 400 to 700, 700 to 400, 400 to 700, one toggle per hold; single presses alternate 400, 700, 400, 700; holding ⌘S for 1 s produced one download
- [x] Skip ⌘P in the MCP walk: it opens the browser's native print dialog, which is expected (the PDF path) — evidence: skipped as written

## Adversarial review

- [x] Claim 1: no key is double-applied — attack: hold ⌘B on a selection and count toggles; result (third walk): holds toggle once, see the hold row above; the first walk's FAILED for key repeat is fixed. First walk result: FAILED for key repeat. Five separate presses toggle five times (700, 400, 700, 400, 700), so a press is applied once. A held key (repeated keydown with `repeat` true) toggles once per repeat: 1, 2, 3, 5 repeats gave toggle, none, toggle, toggle, so holding ⌘B flickers bold at the repeat rate. Word and the browser do the same, so low severity; the handler does not ignore `event.repeat`
- [x] Claim 2: browser keys outside the document page are untouched — attack: ⌘S on the documents home saves the page; result: on the documents home ⌘S, ⌘P, ⌘B, ⌘/, ⇧/ and ⌘F all arrive with defaultPrevented false and no dialog opens; inside the editor ⌘S downloaded "Untitled document.docx" (Playwright log: Downloaded file Untitled document.docx)
- [x] Claim 3: every hint matches the registry — attack: diff the rendered hints against the registry; result: dialog rows say Download DOCX ⌘S, Download PDF ⌘P, Find ⌘F, Keyboard shortcuts ⌘/, Save title Enter, Cancel title edit Esc; the Download tooltip (⌘S), Find tooltip (⌘F), download menu (⌘S, ⌘P), More actions item (⌘/), title Save (Enter) and Cancel (Esc) tooltips and the toolbar Bold tooltip "Bold (⌘B)" all agree; Windows toggle shows Ctrl and Alt for the same rows

## Coverage honesty

- Windows and Linux key labels are exercised only by unit tests of the platform helper.

## Edge cases found during execution (tester run 2026-10-19)

- [x] Title Save and Cancel tooltips — evidence: with a changed title the tooltips read "Save Enter" and "Cancel Esc"; with an unchanged title Save is disabled and the tooltip reads "Type a different title to save"; Enter saved the title ("Shortcut title · SuperDoc Collab"); the briefing lists these hints as left out, the build has them; .pr-media/testing2/shortcuts-title-save-tooltip-typed-1280.png, shortcuts-title-cancel-tooltip-typed-1280.png
- [x] Toolbar tooltip through `ui.toolbar.strings` — evidence: the Bold button tooltip reads "Bold (⌘B)"; .pr-media/testing2/shortcuts-toolbar-bold-tooltip-1280.png
- [x] More actions menu — evidence: items Delete and "Keyboard shortcuts ⌘/"; the item opens the dialog; Esc closes it after 0, 50, 150 and 400 ms
- [x] Reload with the dialog open — evidence: the dialog is closed after reload; browser Back from the editor with the dialog open returns to the documents home with no dialog; ⌘/ opens it again after Forward
- [x] ⌘⌥1 on an empty paragraph, then typing — evidence: 26.7 px heading; ⌘⇧N after Enter returns the new paragraph to 13.3 px with 50, 120 and 250 ms gaps
- [ ] ⌘⇧N pressed in the same tick as Enter (no gap at all) — FAILED: the first paragraph lost the heading and the second became the heading ("Walk heading" 13.3 px, "Bold body text" 26.7 px); a human cannot press keys in the same tick, so this is a note and not a defect; .pr-media/testing2/shortcuts-heading-rapid-sequence-1280.png
- [ ] ⌘P on the editor — BLOCKED: Download PDF calls window.print(), which opens the native print dialog and froze the Playwright MCP server for about 5 minutes (it recovered with a blank page); the hint and the key binding are proven only by the dialog and menu text
- [x] Console at error level during the whole walk — evidence: 0 errors in the editor; the 401s after archiving belong to the archive plan

## Retest 2026-10-19 (second walk)

- [x] Title Save and Cancel tooltips after lane-shortcuts added the hints — evidence: with a changed title, Save reads "Save Enter" and Cancel "Cancel Esc"; .pr-media/testing2/title-save-tooltip-retest-1280.png, .pr-media/testing2/title-cancel-tooltip-retest-1280.png
- [x] The title row's Cancel is an outlined box — retest at 66e1cc88 passes: computed border 1px solid, variant outline, white background, radius 8px, the gaps between the field, Save and Cancel are 6 px and 6 px at 1280 and at 375 (right edge 355 of 375, scrollWidth 375); .pr-media/testing2/title-row-edit-state-retest3-1280.png, .pr-media/testing2/title-row-edit-state-retest3-375.png. Second walk was FAILED: in this worktree (HEAD e799a0a5) the Cancel button is `variant="ghost"`, computed border 0 px, transparent background, a bare "×" next to the filled blue Save; `document-title.tsx` line 130 still passes `variant="ghost"`; .pr-media/testing2/title-row-edit-state-1280.png. The change is not in lane/testing2.

## Third walk, second-round rows (2026-10-19, lane/testing2 at 66e1cc88)

- [x] ⌘⌥N and ⌘⌥P walk the comments — evidence: on a document with a top comment and a comment 70 lines down, ⌘⌥N scrolled the editor to 0, 1136, 0 and ⌘⌥P to 1136, 0, 1136, wrapping both ways after the 1500 ms settle; keydowns are defaultPrevented; the walk is a scroll, there is no other visible active state; .pr-media/testing2/shortcuts2-comment-walk-clean-1-1280.png to .pr-media/testing2/shortcuts2-comment-walk-clean-6-1280.png
- [x] ⌘⌥T toggles track changes — evidence: ⌘⌥T, typed " TRACKED" gave a `track-insert` run and a card "Added \" TRACKED\""; ⌘⌥T again, typed " PLAIN" added no tracked run, the line reads "TopWord TRACKED PLAIN"; .pr-media/testing2/shortcuts2-track-changes-on-1280.png, .pr-media/testing2/shortcuts2-track-changes-off-1280.png
- [x] ⌘\ clears formatting on a bold selection — evidence: on a triple-click selection, bold alone and bold, italic and underline together returned to 400/normal/none in 5 of 5 trials; .pr-media/testing2/shortcuts2-clear-formatting-bold-before-1280.png, .pr-media/testing2/shortcuts2-clear-formatting-bold-after-1280.png, .pr-media/testing2/shortcuts2-clear-formatting-before-1280.png, .pr-media/testing2/shortcuts2-clear-formatting-after-1280.png. My first trials used Control+Home then Shift+End, which left a collapsed caret, and showed no change; that was the test, not the product
- [x] ⌘] and ⌘[ indent and outdent — evidence: padding 0 to 48 to 96 px, then back to 48 and 0
- [x] ⌘⌥0 normal text after a heading — evidence: ⌘⌥1 gave 26.7 px, ⌘⌥0 returned 13.3 px; .pr-media/testing2/shortcuts2-normal-text-after-heading-1280.png
- [x] The Summarize button and the collapsed bar's expand button show their hints — evidence: tooltips "Summarize edits ⌘ ⌥ S" and "Edits panel ⌘ ⌥ E" (collapsed and expanded); .pr-media/testing2/shortcuts2-hover-summarize-1280.png, .pr-media/testing2/shortcuts2-hover-expand-collapsed-1280.png, .pr-media/testing2/shortcuts2-hover-collapse-open-1280.png
- [ ] AltGr — not driven, skipped as instructed
- [x] 375 px rows with the shell scroller — evidence: documents home document 375 of 375, shell scroller 360 of 360; editor 375/375, shell 375/375, editor 345/345; editor with the edits panel 375/375, 375/375, 360/360; with the shortcuts dialog open 375/375, 375/375, 345/345; with the title in edit mode 375/375, 375/375, 345/345; .pr-media/testing2/w375-editor.png, .pr-media/testing2/w375-editor-panel.png, .pr-media/testing2/w375-shortcuts-dialog.png, .pr-media/testing2/w375-title-editing.png
