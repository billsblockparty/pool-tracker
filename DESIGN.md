# Pool Water Tracker: design record

Live: https://billsblockparty.github.io/pool-tracker/

Status: on GitHub Pages (main / root, `.nojekyll`). The earlier Claude artifact is kept unchanged as the pre-move reference.

Single source of truth for the dashboard's look. Update this file with every UI change.

## Data
- Static JSON files, fetched once per page load with `cache: "no-store"`.
- Asset versioning: index.html loads `calc.js?v=<hash>` and `app.js?v=<hash>`, where the hash is the first 8 hex digits of a SHA-1 of calc.js + app.js. Run `tools/version-assets.sh` before every commit that changes either file, so a cached page can only load the scripts it shipped with. (A commit hash can't be used because a commit can't contain its own hash.) The page source holds no readings.
- `data/tests.json`: array of tests, oldest-first or any order (the page sorts). Each record: `id` (`t-YYYYMMDD-HHMM`, or `t-YYYYMMDD-x` when time unknown), `date` (YYYY-MM-DD), `time` (HH:MM or null), `source`, `score` (%), `fc tc ph ta ch cya fe cu po4 salt temp` (numbers or absent), `nextTest`, `plan`, `notes`, `createdAt`, `edits` (list of corrections).
- `plan` = { steps:[{n, key, title, actions:[text], waits:[text], notes:[text]}], weekly:[{item, amount, note}] }. `key` = the measurement the step fixes (CC for combined chlorine). Amounts are marked `**…**` inside the text and render bold, never split across lines. Rules: never store a metals (iron/copper) step, even when the report has one, and renumber the remaining steps from 1; generic product names only ("store-brand …"), no store, brand, customer, address, phone, barcode or tester. The free-text `recommendations` field is retired.
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
- Latest results (v4, action-first): sections "Needs attention · N" (every warn/bad measurement; CC, never TC, so N equals the status row's out-of-range count; well out first, then slightly out; fixed order FC, CC, pH, TA, CH, CYA, LSI, Fe, Cu, PO₄, Salt), "In range · N" (same order), "Info" (TC reading always; water temperature, or "Water temp and LSI · not recorded" when there is no temperature). Section heading 13px 600 `--c-text-dim`, padding 12/12/6, 1px divider above each heading except the first in its column. One column below 900px; at 900px+ two columns (1.4fr / 1fr, 1px divider between): Needs attention left, In range + Info right. No needs: "Everything in range ✓" (15px 600 `--c-ok`) replaces that section. Panel header: "Latest results" + date/time only.
  - Needs-attention row: grid 1fr / auto, column gap 12px, row gap 2px, padding 10px 12px, 1px divider between rows, no zebra. Line 1: "Full name (ABBR)" 15px 600 (ABBR 400 dim; pH and Salt none) | reading 17px 600 tabular + unit 11px dim, 3px gap. Line 2: action 13px 600 in status colour, mark ("!!"/"!") in a fixed slot (width of "!!" + 4px) so the words start at one x: "Raise to lo–hi" / "Lower to lo–hi" (unit-free); CC high "Lower to ≤ 0.2", CC below 0 "Retest: TC below FC"; LSI "Raise/Lower to −0.3 to +0.3" | mini gauge. Line 3 (previous reading only): "▲ 2.08 since Nov 1" 11px dim, both columns.
  - Mini gauge: SVG 96×14, track 84×6 at x 6, radius 3, `--c-divider`; band `--c-band` 30–70% of the track (v2 zone scale); markers square 8×8 (well out), diamond 6px centre-to-tip (slightly out), circle r4.5 (in range / no range), 2px `--c-frame` stroke; pinned values sit at the track end, no arrow. The SVG is shifted 6px right (margin-right −6px) so the track's right end lines up with the reading's right edge; the marker room sits in the row padding. Rendered boxes incl. stroke: square 10×10, diamond 14×14, circle 11×11, all inside the 14px height.
  - In-range and Info rows: one line, flex space-between, padding 7px 12px, 1px divider between; name 14px 400 (+ ABBR dim), reading 14px 500 + unit; in-range rows end with " ✓" in `--c-ok`; missing values "not recorded" 13px dim.
- Latest results rows are toggles ("How to fix"): each Needs-attention row is a `<button>` (aria-expanded, aria-controls, min 44px tall; measured 84px). Line 3: "How to fix ▾" / "▴ Hide steps" (13px 600 `--c-accent`) left, change line right (11px dim, empty with no previous test). Open area directly below the row: `--c-page` background (darker than the panel), padding 12px, full row width, no borders; the next row's 1px divider closes it. Contents: "Step N of M · from Nov 6 test" (13px dim), the plan step body for that row's key, "See full plan" (13px 600 accent) which scrolls to the Treatment plan panel and focuses its heading. No step: "No store step for this. Metal treatments are left out on purpose." (Fe/Cu) or "No store step for this in the latest plan." (15px dim). Any number open; none open by default. In-range and Info rows are not tappable.
- Treatment plan panel (below Latest results): header "Treatment plan" + "from Nov 6 test" (latest test). Step component: grid 20px number column (15px 600 dim) | title (17px 600) | mark + reading at the right (mark 13px 600 status colour, 4px, reading 17px 600 + unit 11px dim; right edge matches Latest's reading edge below 900px); body indented to the title: actions 15px `--c-text` with amounts 600, waits 15px dim, notes 13px dim "Note: …"; actions, then waits, then notes; 6px between lines. Row padding 10px 12px, 1px dividers, no zebra. Steps show even if that reading is now in range. "Every week" sub-section (Latest's section heading style): item 15px left, amount 15px 600 tabular right, condition note 13px dim under it.
- History: each test's toggle is "Treatment plan" and shows that test's plan in the same step component, without the per-step reading (the history row already shows every reading and its status, and the 11/01 "Lower combined chlorine" title would not fit beside it at 360px); notes after it.
- (Retired in v4: the large range bar. Its zone scale lives on in the mini gauge.) Range bar (v2 geometry): Track 8px tall at y 22–30 of the 48px SVG (below the reading-label row), `--c-divider`, radius 4px, inset 7px from each SVG end so end markers never clip. Fixed zones as fractions of the track: 0–0.15 well out low, 0.15–0.30 margin low, 0.30–0.70 ideal, 0.70–0.85 margin high, 0.85–1 well out high; linear within each zone. Margin zones span the margin (half the range if the margin is 0); well-out zones span twice the margin; beyond that the marker is pinned at the track end, with ▶/◀ (11px, dim) on the label line under that end. TC: ideal = FC to FC + CC high, margin = CC margin. Only the band (0.30–0.70, `--c-band`) is drawn on the track. Band limits under the band edges: 11px `--c-text-dim`, tabular, baseline 12px below the track (about 3px glyph gap), no units (TC: FC and FC + 0.2; LSI −0.3 / +0.3); a label is aligned to the track end if it would cross it, and the two merge into one "lo–hi" label if closer than 8px. Bars are redrawn by a ResizeObserver on the Latest results panel, which also re-adds the grid filler cells.
- Point shapes (charts and bars, one `shape()` helper): circle r 4.5 = in range or no range; diamond 6px centre-to-tip = slightly out; square 9×9 = well out. Status fill, 2px `--c-frame` stroke.
- Charts: one per measurement (temp and LSI only once data exists). Shared time axis; band behind the line; points coloured by status. Tooltip on hover, tap or focus.
- History: one row per test, newest first. Readings in a responsive label/value grid; out-of-range values get colour, icon and Lo/Hi.
- Range editor (read-only): same table as before; each Low/High/Margin value is a right-aligned `.num` span in --c-text, 13px, tabular figures; cell padding 8px top/bottom, matching the other tables. No inputs or buttons. Units: below 900px under the name (as before); at 900px and up inline after the name (`.re .trange` display inline, margin-left 4px, line-height 1 so row height is unchanged; 11px, --c-text-dim). Tests without a unit (pH, LSI) show nothing (`.trange-none`). Latest results keeps its range line hidden at 900px+.

## Decisions
- Hand-built page, not the Dashboard type: the type can't take the custom tokens.
- Latest results is action-first (v4): what needs fixing and the target to reach comes first, in-range readings are compressed to one line, and TC is shown as info because its status is CC's. The v3 blocks and the large range bar are retired.
- (v3) Latest results reads top to bottom in one pass per test (name and status, reading on the bar, change), with full names and three chemistry groups, replacing the four-corner table row.
- The range bar is a zoned gauge, not a linear axis: positions in the margin and well-out zones are relative to the margin, so the ideal band lines up on every row; the exact distance is in the text.
- Range bar uses no zone colours: only the neutral band, with status carried by the marker's shape and fill. The track sits on `--c-divider` because the band on it is 3.55:1, vs 2.91:1 on the alternate row. Band on track 3.55, marker ring on band 3.71, marker fills on track ok 10.18 / warn 10.30 / bad 7.51 / line 16.30.
- Status shown by shape as well as colour on charts and bars (never colour alone).
- Units shown beside names in Ideal ranges at 900px+, because ppb (phosphates) vs ppm was ambiguous without them.
- Treatment plans are structured data (steps with amounts), shown as a numbered plan and as "How to fix" under each problem reading; the metals step is never stored and only generic product names are used. The audience includes older, less tech-savvy users, so plan text is 15–17px with 44px+ tap targets.
- Weekly amounts drop the word "weekly" (the section is "Every week"): "Weekly maintenance treatment · 5 fl oz weekly" did not fit on one line at 360px.
- Asset URLs carry a version on every change: GitHub Pages lets browsers cache files for up to 10 minutes, and a new index.html with a cached old app.js rendered mismatched markup.
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
- 2026-11-06: range bar v2: fixed zones (band always 30–70%), band limits under the band, pinning beyond 3× margin, distance-only text, unit slot in the Value cell, bar fills the Range column at 900px+.
- 2026-11-06: Latest results v3: grouped blocks, full names with abbreviations, status phrase with distance, reading label on the bar, change line; table, header row, distance column and unit slot removed.
- 2026-11-06: Latest results v4: Needs attention / In range / Info sections, action phrases with targets, mini gauge, fixed mark slot; header suffix "change vs" dropped; v3 blocks and large bar retired.
- 2026-11-06: cache-busting: script URLs versioned with a content hash (tools/version-assets.sh); no visual change.
- 2026-11-06: added the 11/01 test (t-20261101-x, time unknown), readings verified against the paper report; 11/06 verified, unchanged.
- 2026-11-06: Treatment plan panel, structured plans for 11/06 and 11/01 (recommendations text retired; old edit-log entry reworded to drop the store name), History "Treatment plan" toggle, expandable "How to fix" rows in Latest results.
