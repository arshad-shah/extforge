---
"extforge": minor
---

Add per-entrypoint bundle-size budgets and `extforge build --analyze` (#108).

- **Sizes for every entrypoint:** `extforge build` prints the size of each entrypoint, including the chunks it imports statically. Content scripts and injected scripts are now counted too; before, only the ESM pass was measured.
- **`build.budgets`:** set a limit per entry name or glob (`'content/index': '50kb'`, `'**': '500kb'`). A production build over budget fails with `EXT_BUDGET_EXCEEDED`, showing the overage and the biggest contributors. Dev builds are never failed.
- **`--analyze`:** writes `dist/.extforge/stats-<browser>.html`, a self-contained treemap you can click into, and `meta-<browser>.json`, the merged esbuild metafile.
- **`BuildResult.entries`:** the per-entry sizes are available to plugins and programmatic callers.
