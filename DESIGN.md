# Pool Water Tracker: design record

Live: https://billsblockparty.github.io/pool-tracker/

Status: on GitHub Pages (main / root, `.nojekyll`). The earlier Claude artifact is kept unchanged as the pre-move reference.

Single source of truth for the dashboard's look. Update this file with every UI change.

## Data
- Static JSON files, fetched once per page load with `cache: "no-store"`. The page source holds no readings.
- `data/tests.json`: array of tests, oldest-first or any order (the page sorts). Each record: `id` (`t-YYYYMMDD-HHMM`, or `t-YYYYMMDD-x` when time unknown), `date` (YYYY-MM-DD), `time` (HH:MM or null), `source`, `score` (%), `fc tc ph ta ch cya fe cu po4 salt temp` (numbers or absent), `nextTest`, `recommendations`, `notes`, `createdAt`, `edits` (list of corrections).
- Source labels are generic: "Store" for store-tested reports, "Home kit" for strips/kits. No store or brand names.
- Tests are added by a commit that appends a record to `tests.json`. A test is never overwritten; a correction edits only that record and adds an entry to its `edits`.
- Ranges: there is no `data/ranges.json`. Change ranges by editing `DEFAULT_RANGES` in `calc.js`. (The page still reads `data/ranges.json` `{ranges:{key:{lo,hi,s}}, updatedAt}` if one is ever added; missing keys fall back to `DEFAULT_RANGES`.) Range changes go through the builder.
- No personal information (name, address, store or brand names, tester, pool size or type) is stored or shown.

## Tokens (`:root` in index.html)
| Token | Value | Job |
|---|---|---|
| --c-frame | #08090b | panel border, hard shadow (darkest) |
| --c-divider | #0d1013 | 1px row dividers, input fill |
| --c-page | #111418 | page background |
| --c-panel | #181c21 | panels, odd rows |
| --c-row-alt | #1f242a | even rows, tooltip |
| --c-text | #f2f4f6 | values |
| --c-text-dim | #a9b2bc | labels, units, axis text, input border |
| --c-ok | #5cd394 | in range (✓) |
| --c-warn | #f0b44c | slightly out (!) |
| --c-bad | #ff7a70 | well out (!!) |
| --c-line | #e6eef7 | chart line |
| --c-band | #5f6c79 | chart ideal-range band |
| --c-accent | #8fb8ff | links, "Recommendations and notes" toggles, focus rings |

Radius: panels 6px; tooltip 4px; stat grid inner 4px. Borders: panels 2px frame; rows 1px divider. Shadow: `3px 3px 0 var(--c-frame)` on panels and tooltip only. Spacing: 4 / 8 / 12 / 16 / 24. Type: 11 / 13 / 15 / 22px, system UI stack, tabular figures for numbers.

## Measured contrast (WCAG)
- Text #f2f4f6: 15.5 on panel, 14.2 on alt row. Dim #a9b2bc: 8.0 panel, 7.3 alt.
- Status text: ok 9.1 / 8.3, warn 9.2 / 8.4, bad 6.7 / 6.2 (panel / alt).
- Band vs panel 3.19. Line vs panel 14.6, line vs band 4.59. Accent vs panel 8.5. Range values: --c-text 15.52 on panel, 14.17 on alt row; units --c-text-dim 7.97 / 7.28.
- Known shortfall: status-coloured points on the band are 2.3–2.9:1 against it. Every point gets a 2px frame-colour outline for separation.
- Panel border (frame) vs page 1.08:1. Decorative, because the user's surface order requires the frame to be darkest.

## Status rules
- Status = in range / slightly out / well out. Slightly out means past the range by no more than the margin `s`.
- Defaults (lo–hi, margin): FC 1–4 ±0.5; CC 0–0.2 +0.3; pH 7.2–7.8 ±0.2; TA 80–120 ±20; CH 200–400 ±50; CYA 50–100 ±20; Fe 0–0.2 +0.1; Cu 0–0.2 +0.1; Phos 0–100 +100 ppb; Salt 2700–3400 ±200; LSI −0.3 to +0.3 ±0.2.
- TC status = CC status. The out-of-range count counts TC once and leaves CC out.
- Status always shows an icon and a word: ✓ OK, ! Low/High, !! Low/High.

## Components
- Status row: 6 cells (latest test, days since, next due, score, out of range, test count). 3×2 below 900px, 6×1 at 900px and up. Divider lines come from a 1px grid gap.
- Latest results table: one `<tbody>` per test; zebra on even tbodies; 1px divider under each tbody's last visible row (none under the last tbody). Below 900px: row 1 = Test | Value | Status | Change (8px top / 4px bottom), row 2 = full-width range bar line (0 top / 8px bottom). At 900px+: row 2 hidden, bar line in the "Range" column (min-width 260px), rows 8px top/bottom. Short names below 560px.
- Range bar line: SVG bar (flex 1, min 140px, 16px tall) + 8px gap + range text (11px, tabular, right-aligned). The text box takes the widest visible text's width so every bar shares one left and one right edge. Bars are redrawn by a ResizeObserver on the table, so they redraw on any width change: resize, rotation, or crossing 900px. Track 8px, `--c-divider`, radius 4px; ideal band `--c-band`, clipped to the track's rounded ends; marker = status shape on the track's centre line. Scale: min(lo − margin, value) to max(hi + margin, value), padded 8% each end, never below 0 except LSI; markers are kept 7px inside the track ends. TC: band FC to FC + CC high, scale from FC to max(FC + CC high + CC margin, TC). More than 4× the range width beyond it: scale ignores the value, marker pinned 7px from the end, ▶/◀ (11px, dim) in a 10px space past the track. Text: range in `--c-text-dim`; when out, " · " + distance in `--c-text` ("0.9 high", "176 low"; TC uses CC − CC high). Temperature: "no ideal range"; LSI without temperature: "needs water temp".
- Point shapes (charts and bars, one `shape()` helper): circle r 4.5 = in range or no range; diamond 6px centre-to-tip = slightly out; square 9×9 = well out. Status fill, 2px `--c-frame` stroke.
- Charts: one per measurement (temp and LSI only once data exists). Shared time axis; band behind the line; points coloured by status. Tooltip on hover, tap or focus.
- History: one row per test, newest first. Readings in a responsive label/value grid; out-of-range values get colour, icon and Lo/Hi.
- Range editor (read-only): same table as before; each Low/High/Margin value is a right-aligned `.num` span in --c-text, 13px, tabular figures; cell padding 8px top/bottom, matching the other tables. No inputs or buttons. Units: below 900px under the name (as before); at 900px and up inline after the name (`.re .trange` display inline, margin-left 4px, line-height 1 so row height is unchanged; 11px, --c-text-dim). Tests without a unit (pH, LSI) show nothing (`.trange-none`). Latest results keeps its range line hidden at 900px+.

## Decisions
- Hand-built page, not the Dashboard type: the type can't take the custom tokens.
- Range bar uses no zone colours: only the neutral band, with status carried by the marker's shape and fill. The track sits on `--c-divider` because the band on it is 3.55:1, vs 2.91:1 on the alternate row. Band on track 3.55, marker ring on band 3.71, marker fills on track ok 10.18 / warn 10.30 / bad 7.51 / line 16.30.
- Status shown by shape as well as colour on charts and bars (never colour alone).
- Units shown beside names in Ideal ranges at 900px+, because ppb (phosphates) vs ppm was ambiguous without them.
- GitHub Pages, so anyone with the link can view without a Claude sign-in. Data moved from the artifact database to JSON files; range editing removed from the page (changes go through the builder).
- History is a per-test grid, not a wide table, so it fits 360px without scrolling sideways.
- Change arrows (▲▼) are neutral text, not status colours.
- 2026-11-06: removed the pool details subtitle (user asked for chemistry only).

## Changelog
- 2026-11-06: built page; seeded 11/06 test.
- 2026-11-06: removed pool-details subtitle; source labels made generic ("Store" / "Home kit"); "Store recommendations" heading; store brand names removed from the 11/06 recommendations text. No size, colour or spacing changes.
- 2026-11-06: moved to GitHub Pages (billsblockparty/pool-tracker). Data from data/tests.json (11/06 exported exactly as stored; 11/01 pending confirmation); no ranges.json, defaults from calc.js; range editor read-only; Save/Reset row and input/button styles removed; .re cell padding 4px -> 8px; .nojekyll added.
- 2026-11-06: Ideal ranges shows units inline after the name at >=900px (pH/LSI none); <900px and Latest results unchanged. Name/unit baseline delta 0px.
- 2026-11-06: Latest results range bar (two-row layout below 900px, Range column at 900px+), distance text "x high/low", shape-coded points on charts and bars; range text shares one width so bars align.
