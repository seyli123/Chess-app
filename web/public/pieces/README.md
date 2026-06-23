# Chess piece sets

SVG piece sets vendored from the Lichess source repository:
<https://github.com/lichess-org/lila/tree/master/public/piece>

| Folder       | Style              |
| ------------ | ------------------ |
| `cburnett`   | Default Lichess    |
| `merida`     | Classic tournament |
| `alpha`      | Minimalist         |
| `california` | Illustrated        |
| `gioco`      | Modern             |

Each folder contains 12 files named `<color><role>.svg` where color is `w`/`b`
and role is `P N B R Q K` (e.g. `wN.svg` = white knight).

These assets are the property of their respective authors and are distributed
under the licenses stated in the Lichess repository (`cburnett` is GPLv2+; other
sets carry their own open-source/Creative-Commons terms — consult the upstream
`COPYING.md` and per-set notes for details). They are used here unmodified.

To refresh or change the set list, update `SETS` in
`web/scripts/gen-pieces-css.mjs` (and `PIECE_THEMES` in
`web/src/lib/pieceTheme.tsx`), re-download the SVGs, then run
`node scripts/gen-pieces-css.mjs` from `web/`.
