
# Nashidona Next/Supabase — Patch v3.5.1

This patch implements the agreed Phase 1 features without altering the data model or previously working flows.

## Added
- Category Chips (main/sub) displayed on each card if available; clicking fills search and (client-side) narrows visible results.
- Artist/Album names are clickable and fill the search box.
- "Add All" with safety warnings:
  - Direct add for <= 29 items.
  - Confirmation for 30–100 items and option to add 30 only.
  - Cap at 100; informs user.
  - Dedupes against current queue and shows a summary toast.
- Shuffle toggle keeps the current track in place; turning off restores the original order.
- Drag & Drop reordering in the queue (HTML5), with long-press on mobile supported by native DnD.
- Lyrics icon when lyrics or lyrics_url are present opens a right-to-left overlay panel.
- Album banner appears when all visible results belong to the same album.
- Default cover fallback `/public/logo.png` if no `cover_url` or on image error.
- Mobile footer stays fixed; safe area padding is used.

## Kept
- Existing search API (`/api/search`) & streaming `/api/stream/[id]` untouched.
- Random page bootstrap via `/api/random` intact.

## Notes
- Class-based filtering is applied client-side to avoid DB-side migrations now. DB-side integration can be enabled later by extending `global_search`/adding API filter params.
- Original `pages/index.tsx` saved as `pages/index.backup.tsx` for easy rollback.
