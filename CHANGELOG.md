# Changelog

## 0.2.0-beta.2 — DSH 0.2.1-rc.2 compatibility candidate

- Add the finite host union `0.2.0-rc.2 || 0.2.1-rc.2` to both the DSH engine and optional host peer; do not admit untested future versions.
- Keep the beta.1 model and read-only behavior. In narrow conversation columns, reserve the settings row before opening it to avoid moving the focused summary during reflow. Require browser verification of this candidate layout change. Do not change host styles or hide controls. Keep MIT and no extra model, scheduler or server.
- Update validation and release documentation; require new-host actual SDK, isolated official CLI/Loader and browser checks before publication. Publication and market listing require separate receipts.

## 0.2.0-beta.1 — preparing for publication

- Prepare Goal Map / 目标进展图 as `dsh-plugin-goal-map`, author **sensenzi**, with MIT licensing and Copyright (c) 2026 sensenzi. Include the complete [LICENSE](<LICENSE>) in the explicit 27-file npm allowlist and set `private:false`.
- Set the selected [GitHub repository](https://github.com/sensen-jo/dsh-plugin-goal-map) and [issue destination](https://github.com/sensen-jo/dsh-plugin-goal-map/issues); repository contents, npm package and marketplace listing have not yet been published or accepted.
- Add a bilingual [README](<README.md>) and three captioned synthetic alpha7 showcase images in the repository documentation directory, excluded from npm. They are not newly captured beta.1 screenshots.
- Keep all runtime sources, built client, patch and exact optional DSH `0.2.0-rc.2` peer unchanged. The repository root is the plugin bundle root.
- Update release-gate tests for complete public metadata and real relocated negative cases: missing license metadata/text, missing author, missing repository and `private:true`.

## 0.2.0-alpha.7 — unreleased private candidate

- Make the route's multi-current “view plan” action clear the title filter, open the plan branch, expand every retained plan node and focus the stable branch entry.
- Keep synchronization/parent status, missing formal goal and plan/goal completion discrepancies visible when the route is collapsed, without inventing progress for unavailable data.
- Include each route disclosure's visible action text in its accessible name, expose map preview expansion state, and clear filters when locating all current steps from the list.
- Repeatedly opening the same inspected node focuses and reveals its details on every explicit request, without refocusing on ordinary model updates.
- Ignore completion/pause/block phases attached to an invalid or missing goal objective; a session-title fallback cannot establish a formal goal lifecycle.

## 0.2.0-alpha.6 — unreleased private candidate

- Add a default goal-progress reading route: structured request/goal summary → declared work so far → all unfinished plan items, with original numbers and links to existing details.
- Show an accessible native progress bar only for a synchronized, complete current plan. Each declared plan item has equal weight; returned tools and child completions never advance it. All-completed plans remain distinct from accepted goals.
- Make plan truncation explicit for both array/wrapped projections and retained events; suppress percentages for missing/historical/unavailable/truncated/invalid plans. Invalid formal projections cannot borrow a valid progress denominator from an older fallback. Invalid/truncated snapshots do not create current/next markers in the retained graph/list.
- Prioritize formal goal pause/block over retained running flags. Restore keyboard focus to a stable plan entry when inspected steps are replaced/removed, without stealing focus after it has left the inspector.
- Retain the existing graph/list modes and the same public read-only boundary.

## 0.2.0-alpha.5 — unreleased private candidate

- Strengthen semantic disclosure relationships for independent branches and history review. Use stable history and preview action buttons so expansion retains keyboard focus; group names use only their titles, with separate count/summary descriptions.
- Clarify title-only overview search scope and preserve the same read-only data boundary.
- Keep marketplace-facing metadata preparation separate from the package identity, owner, license and publication gate; no runtime capability or dependency is broadened.

## 0.2.0-alpha.4 — unreleased private candidate

- Add a default mindmap-style **总览图** and retain **步骤列表** as an explicit alternative. Actual goal root, three independent plan/tool/direct-child groups, compact leaf previews and expandable retained nodes; no guessed dependencies or tool ownership.
- Measure decorative SVG grouping curves from real semantic DOM buttons, updating with ResizeObserver on column/font/content/branch changes. Use top-root vertical spine on narrow conversation columns, without a second vertical scroll pane.
- Reuse public details, original plan numbering, live-current/first-pending guards, history boundaries, search, keyboard focus and trajectory inspector. Current is blue solid, first-pending dashed, stale/current declarations downgraded explicitly.
- Bundle the pure detached frozen mindmap projection and regression tests with no new runtime dependencies, network, model, scheduler, persistence or host capability.

## 0.2.0-alpha.3 — unreleased private candidate

- Replace the equal-weight three-lane dashboard with goal → current overview → full numbered plan mainline → independent tool/child records. Remove duplicate metric walls and source boilerplate from each plan card.
- Pure, bounded-data presentation overview: current declarations only for a live running parent; all active declarations are retained, no arbitrary unique focus. First-pending reference keeps original list order, including earlier pending items.
- Prioritize parent reply/confirmation state and child waiting attention; suppress current/first-pending suggestions for unavailable/historical state and parent waiting input. No inferred execution, dependency, ownership or acceptance.
- Compact tool/child glance for long plans, separate running/waiting and recent records, default 4 priority entries with explicit expansion. Search preserves original plan numbering and covers retained records.
- Fold display controls into secondary settings; rename the old fit control to its actual behavior, restoring default text size. Preserve inline detail keyboard focus, session refresh guards, external focus and host composer bounds.
- Reset historical-plan expansion when moving between current/historical plans, and do not let viewing a current plan silently pre-expand a later historical plan. De-emphasize old in-progress declarations outside a live running parent.
- Bundle the pure presentation helper in its own closure, preventing namespace collisions with canonical model helpers. Include its regression tests in the relocatable package.

## 0.2.0-alpha.2 — unreleased private candidate

- Close/reset details when a selected card is filtered, hidden, collapsed or removed; synchronized group collapse and jump state.
- Guard refresh results against session switches, unmount and duplicate in-flight clicks.
- Per-instance accessible IDs, disclosure controls/labelled panels, focus return and deferred external focus until a matching observable node arrives.
- Status text uses host foreground contrast; disconnected/running color remains secondary to explicit text.
- Close a selected plan detail when an index-based whole-list update changes its content; do not silently switch the inspected step.
- Replace per-child linear catalog membership scans with a Set; reject malformed catalog rows before reading their IDs.
- Declare the exact optional DSH peer checked by installed rc.2; keep `engines.dsh` for newer-host metadata without assuming current-source behavior.

## 0.2.0-alpha.1 — unreleased private candidate

- Replace fixed 1380px graph and always-on details with actual-container responsive 3/2/1-column groups.
- Inline card details, focus/reveal within host header/composer bounds and return to selected node on close.
- Preserve truthful historical/unknown/waiting/interrupted/returned status; active child budget preference and omitted counts.
- Deterministic package-local build and provenance metadata; offline validation, explicit tarball allowlist and private release gate.
- Self-contained installation, compatibility, privacy and release documentation.

The beta.1 and private-candidate notes above describe their historical preparation states. Beta.1 subsequently reached public GitHub source and npm publication. Current MIT rights are granted by [LICENSE](<LICENSE>). Beta.2 publication and the configured market's acceptance require their own verification.

## 0.1.0 — local prototype

Read-only Goal/Todo/tool/child view built against DSH 0.2.0-rc.2. Initial synthetic standalone component tests missed real conversation-column clipping; subsequent actual SDK layout regression reproduced and corrected it. Kept as history, not a certified public release.
