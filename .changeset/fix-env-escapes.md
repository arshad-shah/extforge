---
"extforge": patch
---

env: support standard dotenv escape sequences and backtick quoting

`parseDotenv` now matches Vite / dotenv conventions:

- Double-quoted values process `\n`, `\r`, `\t`, `\"`, and `\\` escapes
  (so `FOO="line1\nline2"` produces a newline, not the two-character
  string `\n`).
- Single-quoted values are kept literal (no escape processing) — useful
  for paths that contain backslashes.
- Backtick-quoted values are also kept literal — handy when the value
  contains both single and double quotes.
- Unquoted values still strip the trailing ` #` inline comment.
