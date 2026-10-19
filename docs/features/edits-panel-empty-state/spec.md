# Edits panel empty state, collapsed start, and page top margin

**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner: "faz tambem um empty state sexy nos edits comecando sempre com esse panel colapsado/hidden; faz uma margin do topo do doc pequena ao inves de grudar no header")
**Not changing:** the panel's position preference, the timeline data, the chart

## Change

- **Collapsed start.** The edits panel starts collapsed on every open at every width (today it starts open from 1024 px, `use-panel-position.ts`); the collapsed bar stays where it is. The person's expand/collapse choice during the session is kept for that document until the page unloads; it is not stored across opens.
- **Empty state.** When the document has no edits yet (the timeline answers no events), the expanded panel shows one empty state instead of the empty chart and lists: the `HistoryIllustration` of welcoming-surfaces at a small size, `NO_EDITS_YET_MESSAGE` as the heading, and one sentence (`EMPTY_PANEL_DESCRIPTION`: "Start typing: every change is recorded and appears here by topic and author.") in muted text, centred, with the same paddings as the panel body. The collapsed bar in that state shows the heading only. Copy in `timeline-copy.ts`.
- **Page top margin.** The document page no longer touches the header: the editor container (`superdoc-editor.tsx`, the `data-testid="document-editor"` element) gets a small top padding (`pt-3` at every width, matching the gap the panel already keeps from the header) so the first page's shadow and outline clear the toolbar row. The print frame and the version viewer are untouched.

## Test list

- `use-panel-position.test.tsx`: the panel starts collapsed above and below 1024 px; expanding keeps it expanded on re-render within the session.
- `timeline-panel.test.tsx`: no events → the empty state with heading, description and the illustration; events → the chart as before.
- `superdoc-editor.test.tsx`: the container carries the top padding class.
- E2E: `e2e/timeline.spec.ts` or `documents.spec.ts`: a new document opens with the panel collapsed; expanding it shows the empty state; typing a paragraph replaces it with the chart. Existing specs that expected the panel open at 1280 are adjusted to expand it first (search e2e/timeline.ts for the expand helper).

## Filter box

**Owner approval:** 2026-10-19 (owner: "faz o filter/search ser um pouco mais sexy")

- `filter-box.tsx` is a rounded search field: a `Search` icon inside on the left, a clear button inside on the right that appears only while the draft has text and clears it with focus kept, the existing focus ring tokens, and the same placeholder, labels and keyboard rules (Enter applies, Escape clears a draft, decided from `event.currentTarget.value`).
- The clear button is named `CLEAR_FILTER_TEXT_LABEL` and never touches the applied filters; the chips and Clear filters keep doing that.
- No result count was added: the panel computes no count of matching edits, so there is nothing to reuse.

## Top edits overflow marker

Found by the tester on the showcase document: Top edits shows three contributor avatars and hid a fourth. `ContributorAvatars` keeps the cap and adds a muted `+N` marker, the size of an avatar, named by `moreContributorsLabel`.
