# Plan: About page and SEO metadata

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/app/router.tsx`, `apps/web/src/features/account/account-menu.tsx`, `apps/web/index.html`, `apps/web/public/`

## Steps

- [ ] **Step 1 (red):** router test for `/about`, `about-page.test.tsx`, account-menu test, `index-html.test.ts`; commit red alone.
- [ ] **Step 2 (green):** `AppRoute.About`, `about-copy.ts`, `about-page.tsx`, menu item, route.
- [ ] **Step 3 (green):** `index.html` metadata and JSON-LD; `public/` assets (render `og-image.png`, `apple-touch-icon.png`, `favicon.ico` from the SVG mark with Playwright in a scratch script, commit only the outputs); `robots.txt`; `site.webmanifest`.
- [ ] **Step 4:** E2E in `e2e/about.spec.ts` (signed out `/about`; signed in via the menu); run that file alone; `apps/web/README.md` if it lists the pages; tester briefing.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A public route breaks `RequireSession` redirects in the router test | router tests fail | mount `/about` outside the session wrapper like `/print` |
| 3 | `delivery-docs.test.ts` or a repository-shape test rejects new root-level files | the shape test fails | keep every asset under `apps/web/public/` |
