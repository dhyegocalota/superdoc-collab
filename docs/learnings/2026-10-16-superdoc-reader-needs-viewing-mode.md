# A read-only Hocuspocus connection alone lets the reader's editor diverge silently

- Date: 2026-10-16
- Inspired by: `docs/features/documents-and-history/spike.md` fact 3; slice 2 reader E2E
- Revisited: 2026-10-16 — product applies both flags
- Revisited: 2026-10-17 — still true; final-visuals leaves both flags as they are and a reader gets no toolbar row

## Signal
A reader types, the text stays on their screen, nobody else sees it, `onChange` never fires, and no error appears anywhere.

## Cause
Hocuspocus `connection.readOnly` makes the server refuse updates but SuperDoc keeps applying them locally; SuperDoc exposes no read-only signal and `readOnly` is not a config key.

## Do
Set `connection.readOnly = true` in `onAuthenticate` **and** `documentMode: 'viewing'` in the SuperDoc config; derive the badge from our own role. Also: joiners must receive a valid blank DOCX (an empty blob fails client-side), and awareness `userId` comes from `user.id`.

## Anchor
`apps/server/src/collaboration/collaboration-server.ts`, `apps/web/src/features/editor/superdoc-editor.tsx`, `e2e/documents.spec.ts` (reader specs)
