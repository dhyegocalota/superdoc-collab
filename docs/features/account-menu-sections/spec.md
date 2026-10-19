# Account menu sections, no shortcuts entry in More actions

**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's requirement 33, translated: "clearer sections in the account menu, and no Keyboard shortcuts right under Delete in the document menu")
**ADRs:** none
**Not changing:** the shortcuts dialog and its keys (⌘/ and ?), the actions behind each item, the theme choice

## Problem

The account menu is one flat list, and the document page's More actions menu lists Keyboard shortcuts directly under the destructive Delete.

## Design

- **More actions** drops the Keyboard shortcuts item. The dialog stays reachable by ⌘/, by "?" and from the account menu.
- **Account menu** groups its items under muted labels with separators, in this order: the identity block; Account (Settings, Connected apps); Workspace (Admin, admins only); Help (About, Keyboard shortcuts with its hint); Theme (Light, Dark, System as today); then Sign out alone after a separator.
- Labels live in `account-copy.ts`. Spacing follows the shared dropdown menu primitives.

## Test strategy summary

Unit: the section labels appear in order, Admin and its Workspace label are absent for a user, Keyboard shortcuts sits under Help with its hint, More actions has no Keyboard shortcuts item.
