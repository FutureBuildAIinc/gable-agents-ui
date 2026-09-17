<!--
SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
-->

# Contributing to the Gable Module SDK

Thank you for being here. This is a small module with a large blast radius —
every host and every app in the OpenLBM ecosystem compiles against it — so the
bar is less "did it work" and more "will this still be true in three years".
This document is what that bar actually consists of.

Please also read our [Code of Conduct](./CODE_OF_CONDUCT.md). For security
issues, do **not** open a public issue — follow [SECURITY.md](./SECURITY.md).

If you work with an AI assistant, there is a companion guide:
**[CONTRIBUTING-WITH-CLAUDE.md](./CONTRIBUTING-WITH-CLAUDE.md)**. The repo also
ships a Claude agent kit under [`.claude/`](./.claude/) — slash commands
(`/newcomer-tour`, `/preflight`, `/write-a-test`, `/license-of`, `/file-issue`)
and the skills behind them.

---

## The four rules

Most of what makes a change acceptable here is ordinary Go practice. These four
are the ones that are specific to this repository, and the ones a review will
check first.

### 1. Zero third-party dependencies

`go.mod` has no `require` block. There is no `go.sum`. `go list -m all` prints
exactly one line.

This is not minimalism for its own sake. This module is the **connector seam**:
it is permissively licensed so a third party can write an app under any license
and plug it into a copyleft host without an obligation crossing the boundary.
Every dependency added here is a license and a supply chain that every host and
every app inherits whether they want it or not.

```bash
# Nothing outside the stdlib and this module. `^vendor/` is the Go toolchain's
# own vendored stdlib packages (net/http pulls vendor/golang.org/x/net/idna and
# friends); they are not modules and never appear in `go list -m all`.
go list -deps ./... | grep -v '^github.com/FutureBuildAIinc/gable-sdk' | grep -v '^vendor/' | grep '\.'
```

**Adding a dependency is a licensing decision, not a convenience one.** If you
believe your change needs one, open an issue explaining why before writing the
code. That includes test-only dependencies: the tests here use `testing`,
`net/http/httptest`, and nothing else.

### 2. Never import a host

The SDK depends on abstractions and only abstractions. It must not import
`gable`, or any other host, in any direction — not in a test, not in an
example, not behind a build tag.

If the SDK needs something from a host, that something becomes a **port**: an
interface this module owns, stated in
[`apps/ports.go`](./apps/ports.go), named after the capability rather than the
technology. `Store`, not `Postgres`. `AuditSink`, not `AuditLogger`.
`ErrorResponder`, not `HTTPUtil`. A port with more than a handful of methods is
usually a sign the abstraction is wrong.

### 3. The SPDX header, on every file

```go
// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
```

Markdown uses an HTML comment block; YAML, TOML, and shell use `#`. A file with
no comment syntax is covered by an entry in [`REUSE.toml`](./REUSE.toml).
`reuse lint` is a merge gate, so a missing header fails CI.

### 4. Behaviour changes need a test that fails without them

Not "a test exists". A test that *would have caught this*. The SDK's contracts
are load-bearing in ways that are easy to break invisibly — an operator's
disabled app coming back on after a deploy is a data-loss bug that no compiler
will find.

---

## Getting set up

```bash
git clone https://github.com/FutureBuildAIinc/gable-sdk
cd gable-sdk
go build ./...
go test -race ./...
```

That is the whole setup. Go 1.25 or later, no database, no services, no
codegen. The example host runs with `go run ./examples/hello-app`.

## The pre-flight

Run this before you open a pull request. CI runs the same commands, so a green
pre-flight is a green build.

```bash
gofmt -l .                                  # must print nothing
go vet ./...
go build ./...
go test -race ./...
go test -race -coverprofile=coverage.out -covermode=atomic ./...
go tool cover -func=coverage.out | tail -1

go list -m all | wc -l                      # must be 1
python3 .github/scripts/reuse_gate.py       # needs `pipx install reuse`
```

`/preflight` runs all of it and reads the output back to you.

## Pull requests

- **Target `staging`.** `main` is the release branch; tags are cut from it.
- **One concern per PR.** A behaviour change and a refactor in the same diff
  are two PRs.
- **Say what breaks.** If the public surface changes, say so in the PR body and
  add it to [`CHANGELOG.md`](./CHANGELOG.md) under `## [Unreleased]`.
- **Keep the doc comments.** This codebase's comments explain *why*, not
  *what*, and they are part of the deliverable. A change that invalidates a
  comment must update it.

There is no CLA. Contributions are accepted inbound under the same
`LicenseRef-OpenLBM-Connector-1.0` that governs the outbound module — the
standard inbound=outbound model. By opening a pull request you confirm you have
the right to license your contribution that way.

## What is likely to be accepted

- **Tests.** Especially ones that pin an invariant listed below. This is the
  single most useful contribution to a module this size.
- **Bug fixes** with a failing test.
- **Documentation** that fixes something wrong, or explains something the code
  assumes and never states.
- **A new `Option` or `HandlerOption`.** Functional options are how this
  package grows without breaking a single caller.

## What is unlikely to be accepted

- A new dependency (see rule 1).
- A new method on `Router`. Two is the whole point: the narrower the surface an
  app is handed, the more portable the seam. `Router` is
  [`net/http.ServeMux`](https://pkg.go.dev/net/http#ServeMux)'s registration
  subset and is meant to stay that way.
- Anything that makes enablement checking **fail closed**. `IsEnabled` reports
  *enabled* on an unknown key, a missing store, and a store error, on purpose.
  A catalog that cannot be read must never take a working deployment offline.
- Anything that lets `Sync` write the `Enabled` column, or delete a record.
  Enablement is operator-owned state; orphaned records stay visible as drift
  rather than being destroyed.
- A change to the wire codes `app_disabled`, `app_core`, or
  `app_dependency_conflict`. Clients switch on them.
- Middleware, auth, tracing, or metrics. Apps bind their own inside the
  `Register` closure, and hosts wrap the mux. The SDK has no opinion, and that
  is a feature.

## Invariants worth a test

If you are looking for somewhere useful to start, pick one of these and check
it is covered:

| Invariant | Where |
|---|---|
| `Sync` never writes `Enabled` and never deletes | `Registry.Sync`, `Store` |
| A disabled app's routes 404 with `app_disabled` | `Registry.Mount`, `Registry.Gate` |
| Enablement fails open on every failure mode | `Registry.IsEnabled` |
| A core app refuses to be disabled | `Registry.SetEnabled` |
| Dependencies are enforced in both directions | `validateToggle` |
| A dependency cycle is reported, not hung on | `Registry.Validate` |
| The apps API stays reachable when apps are off | `Handler.RegisterRoutes` |
| `Add` panics on an invalid manifest or a duplicate key | `Registry.Add` |
| An empty catalog serializes as `[]`, not `null` | `Registry.List` |
| `Manifests`, `List`, and a conforming `Store` hand out copies | all |

## Reporting things

- **A bug or a missing capability** — open an issue. `/file-issue` will draft
  one with the detail a maintainer needs.
- **A security vulnerability** — do **not** open an issue. See
  [SECURITY.md](./SECURITY.md); it goes privately to
  [colton@futurebuild.ai](mailto:colton@futurebuild.ai).
- **A licensing question** — `/license-of` answers most of them, and the short
  version is in the [README](./README.md#why-the-license-is-deliberately-permissive).

## Releases

[`VERSION`](./VERSION) names the current release; `CHANGELOG.md` records what
is in it. While the major version is `0` the surface is not frozen — see the
[stability policy](./README.md#stability-policy) — so a minor bump may contain
a breaking change, and it will be listed under `### Changed` with the reason.
