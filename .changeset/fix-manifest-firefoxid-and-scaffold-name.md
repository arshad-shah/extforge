---
"extforge": patch
---

manifest + scaffold: sanitise extension names for Firefox addon-id and npm package-name

- The default Firefox addon id was `${name.toLowerCase().replace(/\s+/g,'-')}@extension`,
  which produced invalid ids for unicode names (`Résumé Helper`),
  emoji-containing names, and names with `&` / `/`. Firefox rejects ids
  outside `[a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+`. A new `deriveFirefoxId`
  helper collapses unsupported character runs to `-`, trims leading and
  trailing `-`, and falls back to `extension` if nothing survives.
- The interactive scaffold prompter validated names by checking the
  *normalised* form (`replace(/\s+/g,'-')`) but stored the original
  un-trimmed input. A name like `My Cool Ext` then ended up in
  `package.json`'s `name` field, which npm rejects. The scaffold now
  normalises the stored name the same way for both `--defaults` and
  interactive flows.
