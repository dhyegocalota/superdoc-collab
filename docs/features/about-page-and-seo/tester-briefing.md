# Tester briefing: About page and SEO metadata

## What changed

- `libs/types/src/routes.ts`: `AppRoute.About = '/about'`.
- `apps/web/src/features/about/`: `about-copy.ts` (all strings and URLs), `about-page.tsx`, `about-page.test.tsx`.
- `apps/web/src/app/router.tsx`: one public route after `/print`, no session wrapper.
- `apps/web/src/features/account/account-menu.tsx`: About item with an `Info` icon, after Connected apps and Admin.
- `apps/web/index.html`: description, application name, light and dark `theme-color`, Open Graph, Twitter, icon links, manifest link, JSON-LD.
- `apps/web/public/`: `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.png`, `site.webmanifest`, `robots.txt`.
- `apps/web/src/lib/index-html.test.ts`, `e2e/about.spec.ts`, `apps/web/README.md` (one sentence).

## How to run

```
pnpm --filter @superdoc-collab/web exec vitest run src/app/router.test.tsx src/features/about src/features/account src/lib/index-html.test.ts
pnpm test:e2e e2e/about.spec.ts
```

## Red today, green after

| Test | Red commit | Failure text |
|---|---|---|
| router: about route needs no session | 9bb8159b | `Unable to find role="heading" and name "About"` |
| account-menu: lists About | 9bb8159b | `Unable to find an accessible element with the role "menuitem" and name "About"` |
| about-page.test.tsx (9 tests before the version pin) | 9bb8159b | `AboutPage is not implemented` |
| index-html.test.ts (7 tests) | 9bb8159b | `index.html has no meta description`, `no meta og:type`, `no JSON-LD`, `expected [] to deeply equal [ …(2) ]` |

The test that pins `SUPERDOC_VERSION` to the installed `superdoc` package landed green with the page: pin.

## Hypotheses for the tester

- `/about` renders signed out with no redirect and no network call besides the session probe.
- Signed in, the account menu lists About below Connected apps; the page's back link returns to Documents; signed out it links to Sign in.
- The four external links open in a new tab with `rel="noreferrer"`.
- The About page has no horizontal scroll at 375 px.
- The built `dist/` holds every file in `public/`, and the server answers `/robots.txt`, `/site.webmanifest`, `/favicon.svg`, `/og-image.png` with 200 and the right type (E2E covers it).
- The JSON-LD parses and its author, license, repository and description match `about-copy.ts`.
- The favicon follows the system colour scheme (SVG `prefers-color-scheme`).

## Gaps

- A 32 px PNG replaces `favicon.ico`; browsers that only request `/favicon.ico` get the SPA index.
- `og:image` is a root-relative path as the spec says; some crawlers need an absolute URL, which is deploy-time.
- The apple-touch icon has transparent corners; iOS paints them black.
- No live crawler or social-card validator was run.
- The Dockerfile claim in the test plan (Claim 3) was read, not run: it copies `apps/web/dist`, which `vite build` fills from `public/`.
