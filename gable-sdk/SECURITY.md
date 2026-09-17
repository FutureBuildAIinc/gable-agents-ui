<!--
SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
-->

# Security Policy

## Reporting a vulnerability

**Email [colton@futurebuild.ai](mailto:colton@futurebuild.ai).**

**Do not open a public issue, discussion, or pull request for a suspected
vulnerability.** This module is a plug-in seam: hosts embed it in their own
servers, so a public report is a public exploit against every deployment that
has not upgraded yet. Report privately, and we will coordinate disclosure with
you.

If you would rather not use email, use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository. Both routes reach the same people.

### What to include

Whatever you have. A useful report usually has:

- the version or commit you tested;
- what an attacker gains — read access, a bypassed gate, a crash, a leak;
- the smallest reproduction you can manage (a failing Go test is ideal, since
  the SDK has no dependencies and runs anywhere);
- anything you already know about a fix.

You do not need a CVSS score, a CVE, or a polished write-up. Send the rough
version rather than sitting on it.

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement that a human has read it | 3 business days |
| Initial assessment — is it a vulnerability, and how bad | 10 business days |
| Fix released, or a dated plan if the fix is large | 90 days from the report |

If we go quiet past those windows, escalate by replying to your own thread. We
would rather be nagged than have a report rot.

We will credit you in the advisory and the [changelog](./CHANGELOG.md) under
whatever name you choose, or keep you anonymous. There is no bug bounty.

## Coordinated disclosure

We ask for the usual 90 days before public disclosure, and we will move faster
than that whenever we can. If a vulnerability is already being exploited, tell
us and we will drop the embargo — an in-the-wild bug is better published than
kept quiet.

## Scope

**In scope** — anything in this repository:

- `apps` — the SDK, its registry, its enablement gate, and its HTTP handler.
- `memstore` — the in-memory `apps.Store`.
- `examples/hello-app` — the example host and app.
- The repository's own CI and release tooling.

Things that are genuinely this module's problem, and that we want to hear
about:

- **A gate bypass** — a request reaching a disabled app's route.
- **A dependency-validation bypass** — a toggle that leaves the catalog in a
  state `Registry.Validate` would reject.
- **Enablement corruption** — anything that makes `Sync` overwrite the
  operator-owned `Enabled` column, or delete a record.
- **Leakage through the error path** — `JSONErrorResponder` or the
  `app_disabled` / `app_core` / `app_dependency_conflict` envelopes revealing
  more than the machine-readable code and a generic message.
- **A panic reachable from a request.** `Add` and `AddStatic` panic by design,
  but only during startup wiring; a panic on a served request is a bug.
- **Resource exhaustion** — unbounded allocation or a deadlock reachable
  through the SDK's public API.
- **A supply-chain regression** — anything that adds a third-party dependency
  to `go.mod`. The zero-dependency guarantee is a security property here, not
  just a licensing one.

**Out of scope:**

- Vulnerabilities in a **host** that embeds the SDK, including its `Store`
  implementation, its authentication, and its admin guard. Report those to that
  project. If the SDK's contract *led* a host into the mistake, that is in
  scope — tell us and we will fix the contract or the documentation.
- Vulnerabilities in a **third-party app** built against the SDK.
- **`memstore` losing data on restart.** It is documented as unfit for
  deployment and is not a persistence guarantee.
- **Fail-open enablement.** `IsEnabled` deliberately reports *enabled* when the
  store is unreachable, when the key is unknown, and when there is no store at
  all: a catalog that cannot be read must not take a working deployment
  offline. This is a documented design decision, not an authorization
  mechanism — enablement is an operator's install/uninstall switch, and access
  control is the host's job. If you can make the store fail *on demand* in
  order to turn an app back on, that is interesting; say so.
- **`AddStatic` and `Add` panicking**, on their documented conditions.

## Supported versions

Pre-1.0, only the latest tagged release is supported. Fixes land on `main` and
in the next tag; there are no backports to earlier `v0.x` tags. See the
stability policy in the [README](./README.md#stability-policy).

## Security posture

Two properties are worth stating plainly, because they are what a reviewer
should check first:

1. **Zero third-party dependencies.** `go.mod` has no `require` block, so this
   module contributes no transitive supply-chain surface to anything that
   imports it. `go list -m all` prints exactly one line. Any pull request that
   changes that is a breaking change and is treated as one.
2. **No I/O of its own.** The SDK opens no sockets, reads no files, and issues
   no queries. Everything that touches the outside world arrives through a
   host-supplied port (`Store`, `AuditSink`, `ErrorResponder`) or through the
   `net/http` handlers the host mounts.
