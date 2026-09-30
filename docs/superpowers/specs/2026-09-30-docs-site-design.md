# next-query docs site — design

Date: 2026-09-30
Status: approved in chat, pending written review
Branch: `dev` (PR `dev → main`, separate from PR #1)

## Goal

A documentation site for `@angelitolm/next-query` in the same style as next-toolbar's (`C:\dev\next-toolbar\docs`, live at next-toolbar.angellm.dev), with a live demo of the panel that works in the browser without installing anything.

## Scope decisions

- Where: a `docs/` Next app inside the next-query repo, added to the pnpm workspace. It depends on the package through `workspace:*`.
- Stack: copied from next-toolbar's docs, same versions:
  - Next 16.3.6 and next-intl, with locales `en` (default) and `es`
  - `@next/mdx` with remark-gfm, rehype-slug, rehype-pretty-code and shiki
  - Tailwind 4 with typography
  - next-themes and iconsax-reactjs
- Look: next-toolbar's layout, components and typography, recolored:
  - Primary is next-query's orange → yellow (`#ff8a3d` → `#ffd23f`).
  - Anything that means "fresh" uses lime → cyan (`#c6ff5c` → `#5ef5e0`), matching the panel.
  - The header uses the NQ logo (`packages/next-query/logo.svg`).
  - A gradient "Live demo" button in the header, like next-toolbar's.
- The spec's `docs/superpowers/` folder stays where it is. The site is `docs/app`, `docs/content`, etc., like next-toolbar, so the two share the `docs/` folder. The site's MDX lives in `docs/content/`, and Next ignores `docs/superpowers`.

## Pages (EN and ES, same slugs)

| Section | Slug | Content |
|---|---|---|
| Start | `index` | What next-query is, a 10-line example, and a panel screenshot or link to the demo |
| Start | `getting-started` | Install, first `query()`, `revalidate()` from a server action, mount `<NextQuery />` |
| Guide | `query` | Signature, `revalidate` option, JSON-serializable results, reusing with plain functions, errors (recorded and rethrown; `notFound`/`redirect` pass through) |
| Guide | `revalidate` | Prefix semantics, string shorthand, where to call it (actions and route handlers), the segment-config name clash |
| Guide | `keys-and-tags` | Key rules, hierarchical tags `nq` / `nq:a` / `nq:a/b`, escaping, the 256 and 128 limits, number vs string keys |
| Guide | `panel` | What each part shows: launcher bubble, cards, freshness bar, status, detail rows, JSON and copy, revalidate buttons, tag chips, Reload list, Revalidate all, `position` |
| Reference | `compatibility` | Next 15.0 → 16 (CI matrix), React 19, `unstable_cache` underneath |
| Reference | `security` | Dev-only registry and actions, key validation, what a production build contains, LAN exposure of `next dev` |
| Reference | `troubleshooting` | "My query isn't in the panel", a `Date` comes back as a string, stale page after revalidate, name clash |
| Project | `contributing` | Workspace, playground, tests, dev and prod smoke |

The sidebar order, prev/next links and titles come from one `lib/pages.ts` plus `messages/<locale>.json`, as in next-toolbar.

## Live demo (`/[locale]/demo`)

- The package gets a new public export, `NextQueryDemo`. It is the real panel UI driven by in-memory data, and it works in any environment, including production. It follows next-toolbar's `NextToolbarDemo` pattern.
- Refactor: the panel's data access becomes a small internal interface: `{ getQueries(): Promise<Entry[]>; revalidateQuery(key): Promise<void>; revalidateAll(): Promise<void> }`.
  - `<NextQuery />` passes the real server actions. It still renders nothing outside development and still refreshes the router after actions.
  - `NextQueryDemo` passes in-memory functions. It skips the dev guard and `router.refresh()`, and takes a callback so the page can update its own data.
  - The UI (Panel, Card, Detail, DataView) is shared, not duplicated.
- Props: `entries: Entry[]` (initial fixtures), `onRevalidate?(key)`, `position?`, `defaultOpen?`.
  - Revalidating in the demo sets `dataUpdatedAt = now` and `runs + 1` on matching entries (prefix match by tags) and calls `onRevalidate`.
  - The page re-renders a fake store (products list and stats) whose "fetched at" times move.
- `Entry` and the demo props are exported as types.
- The demo page has a short explanation, a fake store on the left, and the panel open by default. It works on mobile widths.

## Deploy

- Vercel project `next-query-docs`, root directory `docs`, git-connected so every push to `main` deploys. Domain `next-query.angellm.dev`; the user adds the CNAME.
- Nothing is created on Vercel without the user's explicit confirmation.
- The repo is private for now. GitHub links in the docs sit behind a `REPO_PUBLIC` flag, `false` until the repo goes public, same as next-toolbar.

## Testing

- `docs/test/messages.test.ts` (`node --test`) checks that `en` and `es` have the same message keys and that every slug has content in both locales, as next-toolbar does.
- A package unit test for the demo's in-memory revalidation (prefix matching): the logic lives in `core.ts` as `revalidateEntries(entries, key, now)`.
- `pnpm --filter docs build` must pass. It runs in CI as a new step in the `check` job.
- Visual check in a real browser by the controller: docs pages in light and dark, the demo, and 375px width.

## Additions during execution (2026-09-30)

- `NextQueryDemo` gets an `inline` prop (panel embedded in the page, always open) so the demo store stays visible.
- The docs layout does not mount `<NextQuery />` (the site has no queries; it produced a second panel on /demo).
- Package: `tags(key)` returns a key's cache tags so a native `fetch(url, { next: { tags: tags('products') } })` is expired by `revalidate('products')`. Such fetches are not listed in the panel.

## Non-goals

- A search box and versioned docs.
- The Vercel analytics, OG images and GIF recorder from next-toolbar (can come later).
