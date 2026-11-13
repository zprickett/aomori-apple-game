# Aomori Codex build package v2

Extract this folder into a new or existing Codex project. Paste `CODEX_BUILD_PROMPT.md` into Codex, or ask Codex to read it and implement it.

If a prototype already exists, ask Codex to update its cooking system to this v2 contract while preserving its art, 10 apples, 5 playable recipes, 50 fit scores and player progress. Do not rebuild unrelated features.

Read order: build prompt → timed action contract → recipe action JSON → prototype data. Recipe descriptions explain preparation evidence and deliberate simplifications. Art references remain unchanged.

The 20 action plans are design data, not 20 implemented recipes. Only the five marked `prototype_playable` should be built now. Old `skill_sequence` values outside this package are superseded by the action plans. The v1 apple data schema remains compatible; action schema is v2.

Run the pure reference checks with `node test_timing_reference.mjs`. The package supplies specifications and reference logic; it does not contain a rendered game or tested gesture recognizers. Timer values require playtesting.

## Changed from v1

- Only swipe, tap and circle; no hold or free-drag controls.
- 1–5 meaningful, timed actions per recipe instead of generic three-step flows.
- Whole-apple integrity, correct mixing stages and explicit chef preparation bridges.
- Normalized action grades feed the existing 0–3 dish scoring.
- Save migration, retry and pause behavior are specified.
- Source-informed plans cover all 20 dishes; 10-apples/5-recipes playable scope is preserved.

Research checked 15 October 2026. Game timing/gesture mappings are authored design choices, not empirical cooking claims.
