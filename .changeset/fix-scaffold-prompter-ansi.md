---
"extforge": patch
---

scaffold: fix interactive prompts printing literal `[2K`/`[1A` text

The `select`/`multiselect` prompts in `extforge init` were missing the `\x1b`
escape byte from their cursor-control sequences, so users saw garbage like
`[3A[2K[2K` printed between redraws instead of the prompt actually being
redrawn. Now emits real ANSI escapes and skips the cursor-up move when only a
single line was previously rendered.
