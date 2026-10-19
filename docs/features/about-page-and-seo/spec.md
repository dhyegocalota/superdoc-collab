# About page and SEO metadata

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's requests, translated: "also put the GitHub repo link on a new About page in the user dropdown, very short: about me the author, the library, the licence, the credits"; "do SEO/GEO optimisations such as title, metas, favicon")
**ADRs:** none
**Not changing:** the sign-in flow, the README, `docs/credits.md`

## Change

### About page

- `AppRoute.About = '/about'`, public (no session, like the print route), element `AboutPage` in `apps/web/src/features/about/`.
- Linked from the account menu (`account-menu.tsx`) with an `Info` icon and label `About`, above Settings' separator group end.
- Short: one heading, one sentence of purpose, then a definition list: Author (Dhyego Calota, link to `https://github.com/dhyegocalota`), Source (`https://github.com/dhyegocalota/superdoc-collab`), Built with (SuperDoc 2.23.0, Hocuspocus, Yjs, React, Hono, SQLite), License (AGPL-3.0-only, link to the repository `LICENSE`), Credits (link to `docs/credits.md` in the repository, plus the names it lists). Copy in `about-copy.ts`; the version string comes from `superdoc/package.json` at build time (`import { version } from 'superdoc/package.json'` with `resolveJsonModule`) or a constant in `libs/types` if the import is refused.
- Back link to Documents for signed-in users (`useSession`), to Sign in otherwise.
- `useDocumentTitle(ABOUT_TITLE)`.

### SEO and generative-engine metadata (`apps/web/index.html` and `apps/web/public/`)

- `<title>SuperDoc Collab</title>` stays the fallback; `<meta name="description">` one sentence; `<meta name="application-name">`; `<meta name="theme-color">` for light and dark (`media` attribute) with the app's paper and background tokens; `<link rel="canonical">` is omitted (origin is deploy-time).
- Open Graph and Twitter: `og:type=website`, `og:title`, `og:description`, `og:image=/og-image.png` (1200×630 PNG rendered once from an HTML template with Playwright in the lane, committed), `twitter:card=summary_large_image`.
- Icons: `favicon.svg` (the app mark, dark-mode aware with `prefers-color-scheme`), `favicon.ico` (32 px), `apple-touch-icon.png` (180 px), `site.webmanifest` with name, short name, icons, `theme_color`, `background_color`, `display: standalone`.
- `robots.txt`: allow `/`, `/about`, `/sign-in`; disallow `/api/`, `/documents/`, `/share/`, `/print`, `/settings`, `/admin`.
- JSON-LD `SoftwareApplication` in `index.html`: name, description, `applicationCategory: BusinessApplication`, `operatingSystem: Web`, `author` (Person, Dhyego Calota, GitHub URL), `license` (AGPL-3.0 URL), `codeRepository`, `isBasedOn` (SuperDoc), `offers` free.
- The server serves `apps/web/public` through the existing static mount; a unit test in `apps/server/src/repository-shape/` or `apps/web` pins that the four icon files, the manifest, `robots.txt` and `og-image.png` exist in `public/`, and `index.html` names each of them.

## Test list

- Router test: `/about` renders without a session.
- `about-page.test.tsx`: the five rows, the two external links with `rel="noreferrer"`, the back link per session state.
- Account menu test: the About item exists and links to `/about`.
- `index.html` test (`apps/web/src/lib/index-html.test.ts`, like `theme-script.test.ts`): description, Open Graph, Twitter, icons, manifest and JSON-LD present and parseable; JSON-LD author and license match the copy constants.
- E2E: `/about` loads signed out and from the account menu signed in.
