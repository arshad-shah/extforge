---
"extforge": patch
---

validator: wire manifest-config validation into the build pipeline

`validateManifestConfig` was exported but never called from the build /
dev paths, so users with a missing `manifest.name`, a non-semver
`version`, or a too-long `description` got a silently invalid manifest
written to disk.

`validateProject` now accepts an optional `manifest` in its options
object and surfaces manifest-level errors/warnings as project
validation issues. The CLI's `dev` and `validate` commands pass
`config.manifest` through so the check actually runs.
