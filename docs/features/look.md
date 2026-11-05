# The look: tokens, the price tag, life stamps and drawings

## What it does

Gives every page one warm, calm look: cream paper, forest green, terracotta, rounded headings, and three signature pieces taken from the loop itself (the price tag, the life stamp and a drawing per kind of item). It also separates what a customer sees from the demo tools, so the product reads as a product and the back office stays one click away.

## The rule

- **Pages use roles, never colours.** `src/app/globals.css` defines the colours once and maps them to roles (`brand`, `accent`, `success`, `info`, `warning`, `danger`, `staff`, `surface`, `raised`, `muted`, `line`, `ink`…). Each role switches with the colour scheme, so no page needs a `dark:` class and retuning the look is one file.
- **The monthly price is the biggest number on a page** and sits on the price tag (`PriceTag`). The tag's number flips when it changes.
- **A life stamp says which life an item is on** (`LifeStamp`): "Life 1 · New" in forest green; every later life ("Life 2 · Checked") in terracotta. Worked through card 10: `ebike-008` has `previous_lives: 2`, so its card and passport carry "Life 3 · Checked" in terracotta.
- **Every item has a drawing** (`ItemArt`), since the data pack has no photos. `artKindFor(category, model)` picks it from the model name: "Cargo Duo" and "Delivery Pro" are cargo bikes, "Fold Mini" folds, "T-140 Tractor" is a tractor; anything else gets its category's plain drawing.
- **Customer screens and demo tools are apart.** The teal strip above the header holds "Continue as", the demo page and, for admin only, the audit log link. The demo and audit pages say "Back office: customers don't see this page".
- **Accessible by default:** body text 12.8:1 on cream, muted text 6.7:1, input borders 3.9:1, a light focus ring on the teal strip, one `h1` per page, drawings `aria-hidden`, and the tag flip and stamp press stop under reduced motion.

## Decisions

D21 (revised): the palette, the type pair (Nunito, Fredoka), the roles and the signature pieces.

## Pure functions

`artKindFor(category: AssetCategory, model: string): ArtKind` in `src/components/item-art.tsx`: the first rule whose pattern matches the model wins; otherwise the category's fallback. Presentation only; no prices are computed in the UI.

## Files

- `src/app/globals.css`: colours, roles, shadows, the tag and stamp styles, reduced motion.
- `src/components/ui/price-tag.tsx`, `ui/life-stamp.tsx`, `ui/staff-note.tsx`, `ui/disclosure.tsx` (with the catalogue rework), `item-art.tsx`, `loop-mark.tsx`, `site-header.tsx`.
- The kit restyled in place: `ui/button.tsx`, `ui/card.tsx`, `ui/field.tsx`, `ui/notice.tsx`, `ui/nav-links.tsx`, `ui/page-header.tsx`.

## Tests that pin the numbers

- `src/components/item-art.test.ts`: the drawing for every model in the pack, the fallbacks, and the first-match rule.
- `src/i18n/messages.test.ts`: the new texts exist in all four languages and none is empty.
- `src/components/ui/badge.test.ts`: every status still has a tone.

## Open questions

- Fonts come from Google at build time (`next/font/google`); a build without internet fails. Moving them to `next/font/local` with committed files is a later chore.
- The audit page is hidden from the menu for non-admins but not gated; enough for the demo.
