<!--
Thanks for opening a PR. A brief checklist keeps the review fast.
Delete sections that don't apply.
-->

## Summary

<!-- One or two sentences. What does this change and why? -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Performance / refactor (no behaviour change)
- [ ] Documentation only
- [ ] Test or tooling only

## Linked issues

<!-- Closes #123, refs #456. -->

## Implementation notes

<!-- Anything that helps a reviewer make sense of the diff: tradeoffs,
why not approach X, design decisions worth flagging. Skip if obvious from
the diff. -->

## Testing

- [ ] Added or updated unit tests in `tests/` covering the change
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes locally
- [ ] E2E (`pnpm test:e2e`) passes locally if extension runtime behavior changed
- [ ] Manually loaded `dist/chrome/` in `chrome://extensions` if dev-server or
      manifest behavior changed

## Documentation

- [ ] Updated relevant pages under `docs-site/src/content/docs/`
- [ ] Re-ran `pnpm docs:gen` if config / errors / plugins / brand changed
- [ ] Added or updated TSDoc on any new public API surface
- [ ] Added a Changeset (`pnpm changeset`) describing the bump

## Breaking change notes

<!-- If you ticked "Breaking change" above, describe the migration path. -->

## Checklist

- [ ] No new runtime dependencies in `src/core/` beyond `esbuild`, `ws`, `zod`
- [ ] Followed the rules in `CONTRIBUTING.md`
- [ ] Commits are signed (`git commit -S`) — optional but appreciated
