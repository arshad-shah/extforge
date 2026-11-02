---
"extforge": minor
---

Add `extforge diff` (#109): compare the built manifest against a git ref, a build directory or a `manifest.json`, and rate each change by what existing users will see.

- **Levels:** `prompt` for new permission warnings or host access, where Chrome disables the extension until users accept. `review` for warning-free permissions, optional permissions and CSP-type keys. `info` for everything routine.
- **Git refs** are built in a temporary worktree with the current ExtForge, so plugins, modules and i18n apply to both sides.
- **CI:** `--fail-on prompt|review` exits 1 on a blocking change, and `--allow-noted` lets a change through when a pending changeset mentions it. `--json` prints a machine-readable report.
