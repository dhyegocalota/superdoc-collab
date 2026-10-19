# Test plan: About page and SEO metadata

## The failing test first

- [ ] `router.test.tsx::/about renders without a session` — expected: the About heading — BLOCKED: unit tests are the lead's gate
- [x] Confirmed it fails for the right reason (red commit 9bb8159b): `TestingLibraryElementError: Unable to find role="heading" and name "About"` (the route was missing, so the router redirected to sign-in). Account menu: `Unable to find an accessible element with the role "menuitem" and name "About"`. `index-html.test.ts`: `Error: index.html has no meta description`, `index.html has no meta og:type`, `index.html has no JSON-LD`, and `expected [] to deeply equal [ …(2) ]` for theme-color. The page tests failed with `AboutPage is not implemented` from the stub.

## Unit

- [ ] `about-page.test.tsx`: author, source, built with, license, credits rows; external links `rel="noreferrer"`; back link to Documents when signed in, Sign in otherwise — BLOCKED: unit tests are the lead's gate
- [ ] `account-menu.test.tsx`: About item links to `/about` — BLOCKED: unit tests are the lead's gate
- [ ] `index-html.test.ts`: description, og:*, twitter:*, icons, manifest, JSON-LD parses with author and license — BLOCKED: unit tests are the lead's gate

## E2E

- [ ] `e2e/about.spec.ts::about opens signed out` and `::about opens from the account menu` — BLOCKED: the E2E suites are the lead's gate; both paths walked in the Prove boxes

## Prove it for real — Playwright MCP

- [x] Signed out: `/about` renders; favicon shows in the tab; view source shows the metadata — evidence: signed out in a clean browser: /about stays on /about, title "About · SuperDoc Collab", heading About, rows Author, Source, Built with, License, Credits and a Sign in link; requests: GET /about, GET /api/me, GET /site.webmanifest only; four external links target=_blank rel=noreferrer; head links /favicon.svg, /favicon.ico, /favicon-32.png, /apple-touch-icon.png, /site.webmanifest all 200; the favicon in the tab itself is not observable in MCP; view source via curl / shows description, og:*, twitter:*, theme-color pair, icons, manifest and JSON-LD; screenshot .pr-media/testing/about-page-and-seo-signed-out-1280.png
- [x] Signed in: account menu → About → Back to documents — evidence: Eva and Ana: account menu lists Settings, Connected apps, About (for the admin Admin sits between Connected apps and About); About opens /about, the link reads "Back to documents" to /documents and returns there; screenshot .pr-media/testing/about-page-and-seo-account-menu-1280.png
- [x] 375 px: no horizontal scroll — evidence: signed out at 375: scrollWidth 375 = innerWidth 375; screenshot .pr-media/testing/about-page-and-seo-signed-out-375.png
- [x] `curl /robots.txt`, `/site.webmanifest`, `/og-image.png`, `/favicon.svg` answer 200 with the right content types — evidence: 200 /robots.txt text/plain; charset=utf-8; /site.webmanifest application/manifest+json; /favicon.ico image/x-icon; /favicon.svg image/svg+xml; /og-image.png image/png; also /apple-touch-icon.png and /favicon-32.png image/png; the plan names /favicon.svg and it is served

## Adversarial review

- [x] Claim 1: the JSON-LD is valid — attack: parse it and validate the `@type` fields; result: — evidence: JSON.parse of the page's ld+json succeeds: @type SoftwareApplication, author @type Person Dhyego Calota, license URL, codeRepository, isBasedOn SoftwareApplication SuperDoc, offers @type Offer price 0 USD
- [x] Claim 2: the public route leaks nothing — attack: open `/about` with no cookie and read the network panel; result: — evidence: /about with no cookie: only GET /about, GET /api/me and the manifest; no document or user data in the page
- [ ] Claim 3: the icons are served by the production image — attack: check the Dockerfile copies `public/` through the web build; result: — BLOCKED: the Docker image was not built here; the stack serves the built dist (all icons 200)

## Coverage honesty

- Search-engine rendering is not verified against a live crawler.

## Edge cases found during execution

- DEFECT: GET / and GET /index.html answer with og:image and twitter:image as the root-relative "/og-image.png", while /about, /sign-in, /documents and any unknown path answer with the absolute "http://127.0.0.1:3200/og-image.png". The static file middleware serves index.html for / before the fallback that rewrites the origin (apps/server/src/http/static-web.ts: serveStatic on '*' runs before the rewriting app.get). The root URL is the one a social card crawler fetches first, so the follow-up rule "the served page's og:image starts with the app origin" fails for it. Reproduce: curl -s http://127.0.0.1:3200/ | grep og:image versus curl -s http://127.0.0.1:3200/about | grep og:image. Regression test requested: the static-web test must request / and /index.html, not only a deep path.
- robots.txt allows /, /about and /sign-in and disallows /api/, /documents/, /share/, /print, /settings, /admin
- The favicon SVG contains a prefers-color-scheme rule (grep count 1)
