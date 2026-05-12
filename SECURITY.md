# Security Policy

## Supported versions

ExtForge is a 0.x release. While we stabilise, only the **latest published
minor** receives security fixes. Older 0.x minors do not.

| Version  | Supported |
|----------|-----------|
| `0.3.x`  | Yes       |
| `< 0.3`  | No        |

Once a 1.0.0 is cut, this table will switch to "latest minor of the current
major".

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

If you believe you have found a security vulnerability in ExtForge, report
it privately so we can investigate and ship a fix before it becomes public.

Use one of the two channels below.

### 1. GitHub private vulnerability reporting (preferred)

Open a report at
<https://github.com/arshad-shah/extforge/security/advisories/new>.

GitHub will notify the maintainer privately and provide a private workspace
where we can collaborate on the fix.

### 2. Email

Send a description of the issue to **shaharshad57@gmail.com**. Include:

- A clear description of the issue.
- A minimal reproduction (config, source files, repro steps).
- The affected version(s) of `extforge`.
- Your assessment of impact and any suggested mitigation.

## What to expect

- **Acknowledgement** within 48 hours.
- A **CVE-worthiness assessment** within 7 days.
- A **patch and coordinated disclosure** typically within 30 days, faster
  for high-severity issues.

After the fix ships, we publish a GitHub Security Advisory and credit the
reporter unless they prefer to remain anonymous.

## In scope

ExtForge is a build tool. The threat model focuses on the artifacts it
produces and the dev-time surface it exposes.

- **Arbitrary file write / path traversal** from `extforge.config.ts`
  inputs to outputs.
- **Manifest injection**: user-controlled values in `manifest.json` that
  escape escaping (e.g. unescaped `content_security_policy`).
- **HMR / dev-server bypass**: the WebSocket dev channel must only accept
  connections from the local extension and must never execute code from
  untrusted origins.
- **Prototype pollution** in config resolution or the plugin pipeline.
- **Bundler-level XSS sinks** introduced into emitted bundles by ExtForge
  itself (not by user code).
- **Supply-chain integrity**: tampering with published tarballs (we ship
  npm provenance attestations on every release).
- **`extforge/storage`, `extforge/messaging`, `extforge/csui`** runtime
  helpers running with elevated extension privileges.

## Out of scope

- Vulnerabilities in user code that pass untrusted input straight to
  `chrome.*` APIs.
- Cross-site scripting in your extension's own HTML/JS that has nothing
  to do with ExtForge's runtime helpers.
- Vulnerabilities in transitive dev dependencies that don't ship in
  `dist/` (run `pnpm audit` on your own application instead).
- Issues that require a hostile build environment (e.g. compromised
  `node_modules`, hostile editor extension).
- Browser policy decisions outside our control (CSP defaults imposed by
  the browser store, sandbox sandboxes, etc.).

## Supply-chain hardening

The release pipeline is configured for high integrity:

- Every published version has an **npm provenance attestation** linking
  the tarball back to this repo + commit + workflow.
- Publishing uses **npm trusted publishing (OIDC)** rather than long-lived
  tokens. The `id-token: write` permission is scoped per-job.
- The publish job runs in a GitHub Environment (`npm-publish`) that
  **requires reviewer approval**.
- All third-party GitHub Actions are **SHA-pinned**.
- `pnpm install --frozen-lockfile` rejects any lockfile drift in CI.
- `pnpm audit --prod` runs on every PR; a vulnerable production tree
  blocks merge.
- CodeQL static analysis runs on every PR and weekly.
- OpenSSF Scorecard runs weekly and uploads results to the Security tab.

## Verifying a release

```bash
npm view extforge --json | jq '.dist.attestations'
```

Should return a non-empty object pointing at this repository.
