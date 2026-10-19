# Test plan: About page and SEO metadata

## The failing test first

- [ ] `router.test.tsx::/about renders without a session` — expected: the About heading
- [x] Confirmed it fails for the right reason (red commit 9bb8159b): `TestingLibraryElementError: Unable to find role="heading" and name "About"` (the route was missing, so the router redirected to sign-in). Account menu: `Unable to find an accessible element with the role "menuitem" and name "About"`. `index-html.test.ts`: `Error: index.html has no meta description`, `index.html has no meta og:type`, `index.html has no JSON-LD`, and `expected [] to deeply equal [ …(2) ]` for theme-color. The page tests failed with `AboutPage is not implemented` from the stub.

## Unit

- [ ] `about-page.test.tsx`: author, source, built with, license, credits rows; external links `rel="noreferrer"`; back link to Documents when signed in, Sign in otherwise
- [ ] `account-menu.test.tsx`: About item links to `/about`
- [ ] `index-html.test.ts`: description, og:*, twitter:*, icons, manifest, JSON-LD parses with author and license

## E2E

- [ ] `e2e/about.spec.ts::about opens signed out` and `::about opens from the account menu`

## Prove it for real — Playwright MCP

- [ ] Signed out: `/about` renders; favicon shows in the tab; view source shows the metadata
- [ ] Signed in: account menu → About → Back to documents
- [ ] 375 px: no horizontal scroll
- [ ] `curl /robots.txt`, `/site.webmanifest`, `/og-image.png`, `/favicon.svg` answer 200 with the right content types

## Adversarial review

- [ ] Claim 1: the JSON-LD is valid — attack: parse it and validate the `@type` fields; result:
- [ ] Claim 2: the public route leaks nothing — attack: open `/about` with no cookie and read the network panel; result:
- [ ] Claim 3: the icons are served by the production image — attack: check the Dockerfile copies `public/` through the web build; result:

## Coverage honesty

- Search-engine rendering is not verified against a live crawler.
