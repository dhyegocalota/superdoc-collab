# @superdoc-collab/web

The single-page app: React, Vite, TanStack Query and React Router, styled with Tailwind and shadcn/ui ([ADR 0009](../../docs/adr/0009-design-system.md)). SuperDoc renders the live editor and, inside an iframe, the read-only version viewer. Pages for approving an AI client and for revoking its access sit next to the document list. An admin page lets the administrator invite people, change roles, create password reset links and add the showcase document. The share dialog lists the people with access and lets the owner remove them, and leaving a document with unsynced edits asks for confirmation. The sign-in pages sit beside a drawn history illustration, and an empty document list invites a first document with a drop zone, while any file dropped on the list page uploads. A public About page names the author, the licence and the credits, and the page shell carries the search and sharing metadata.

The server serves the built bundle on its own port.
