---
"extforge": patch
---

Fix content scripts in `extforge dev`.

- **Script IDs are now assigned.** `contentScripts[].js` names the built file (`content/index.js`), but the content-script map compared it with source paths, so no script ID was ever assigned in a real project. Every edit reloaded every content script. Targeted reloads now work.
- **Editing no longer rebuilds content scripts wrongly.** After the first edit, the incremental dev rebuild overwrote content scripts as ES modules without their script ID. The incremental context now holds only ES-module entries and is used only for UI-only edits. Every other change gets a full rebuild, which also refreshes the manifest, HTML, injected and CSUI entries.
