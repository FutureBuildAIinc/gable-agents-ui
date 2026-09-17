<!--
SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
-->

# Gable Module SDK

[![License: OpenLBM Connector 1.0](https://img.shields.io/badge/license-OpenLBM--Connector--1.0-blue)](./LICENSE)
[![Dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)](#zero-dependencies-is-a-promise-not-a-preference)
[![Go 1.25+](https://img.shields.io/badge/go-1.25%2B-00ADD8)](https://go.dev/dl/)

```
go get github.com/FutureBuildAIinc/gable-sdk
```

The plug-in seam of the [OpenLBM Standard](https://github.com/FutureBuildAIinc/openlbm).
It is the contract between an **installable app** and the **host** that runs
it: an app declares a manifest and mounts some HTTP routes, and the host gets a
catalog, an enable/disable API, and a per-request gate in front of everything
the app registered.

It is the installable-apps layer of the [Gable](https://github.com/FutureBuildAIinc/gable)
ERP, extracted so it can be depended on from outside — which is the only way a
third party can build on it.

**It has no dependencies.** `go.mod` has no `require` block; `go list -m all`
prints one line. That is a licensing property, not a style choice — see below.

---

## Contents

- [Why the license is deliberately permissive](#why-the-license-is-deliberately-permissive)
- [Quickstart](#quickstart)
- [The model](#the-model)
- [The three host ports](#the-three-host-ports)
- [The public API surface](#the-public-api-surface)
- [Enablement semantics](#enablement-semantics)
- [The HTTP API](#the-http-api)
- [Testing an app](#testing-an-app)
- [Stability policy](#stability-policy)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)

---

## Why the license is deliberately permissive

Gable's core is copyleft. This module is not, and the difference is the whole
design.

This repository is licensed under the **OpenLBM Connector License 1.0**
(`LicenseRef-OpenLBM-Connector-1.0`, concept lineage Apache-2.0, no copyleft;
full text in [`LICENSE`](./LICENSE)). Its Deed says it plainly:

> Take this and build anything, open or closed, and keep your changes if you
> like. It exists so every layer can plug into the commons without dragging
> anyone's license across the boundary.

The problem it solves: a copyleft host is good for a commons — improvements
come back — but it is a wall for anyone who wants to *plug into* that commons.
If the only way to write an app is to link against copyleft-licensed
interfaces, then every app is arguably a derivative work, and a dealer's
in-house integration or a vendor's commercial add-on becomes a legal question
instead of an engineering one. In practice that means nobody builds.

So the seam is carved out. **The interfaces you compile against are
permissively licensed, deliberately, so that the license stops at the
boundary.** Write an app under GPL, under a proprietary license, under
anything — the SDK asks for nothing back. The reciprocity lives in the core
where it belongs; the connector is neutral ground.

See [`LICENSE-MAP.md`](https://github.com/FutureBuildAIinc/gable/blob/main/LICENSE-MAP.md)
in the host repository for the per-component map, and the
[OpenLBM Standard](https://github.com/FutureBuildAIinc/openlbm) for the
Profiles themselves.

### Zero dependencies is a promise, not a preference

A permissive license on a module that pulls in five transitive dependencies is
a promise you cannot keep: whoever imports it inherits those licenses and that
supply chain. This module has none. Every import is `net/http`, `context`,
`encoding/json`, `log/slog`, and friends.

That is enforced in CI as a merge gate, not documented as an aspiration:

```console
$ go list -m all | wc -l
1
$ go list -deps ./... | grep -v '^github.com/FutureBuildAIinc/gable-sdk' | grep -v '^vendor/' | grep '\.'
$ # (nothing)
```

The `grep -v '^vendor/'` is not a loophole. The Go toolchain vendors a few
`golang.org/x` packages *inside the standard library* — `net/http` alone brings
`vendor/golang.org/x/net/idna` and `vendor/golang.org/x/net/http2/hpack` — and
`go list -deps` prints them. They ship with the Go distribution, are not
modules, and never appear in `go list -m all`, which is why the module-graph
check above is the stricter of the two.

Adding a dependency here is a licensing decision. See
[CONTRIBUTING.md](./CONTRIBUTING.md#1-zero-third-party-dependencies).

---

## Quickstart

A complete host with one app. It compiles and runs as written.

```go
package main

import (
	"context"
	"log"
	"net/http"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
	"github.com/FutureBuildAIinc/gable-sdk/memstore"
)

// helloApp is what a third party ships: a manifest that declares who it is,
// and a closure that mounts its routes. It imports the SDK and nothing else.
func helloApp() apps.App {
	return apps.App{
		Manifest: apps.Manifest{
			Key:      "hello",
			Name:     "Hello",
			Summary:  "Greets whoever asks.",
			Category: "Examples",
		},
		Register: func(r apps.Router) {
			r.HandleFunc("GET /api/v1/hello/{name}", func(w http.ResponseWriter, req *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"message":"Hello, ` + req.PathValue("name") + `!"}`))
			})
		},
	}
}

func main() {
	// The Store is where the catalog lives between restarts. memstore is a
	// conforming implementation backed by a map; a real host implements the
	// same three methods over its own database.
	registry := apps.NewRegistry(apps.WithStore(memstore.New()))

	registry.Add(helloApp())

	// Advisory, and worth doing at startup: the only check that every
	// DependsOn key names an app that exists, and that the graph is acyclic.
	if err := registry.Validate(); err != nil {
		log.Fatalf("app catalog: %v", err)
	}

	mux := http.NewServeMux()
	registry.Mount(mux)                                // app routes, behind the gate
	apps.NewHandler(registry).RegisterRoutes(mux, nil) // the /api/v1/apps admin API

	// Write the compiled-in manifests to the store. Never overwrites an
	// operator's enablement, never deletes a record.
	if err := registry.Sync(context.Background()); err != nil {
		log.Fatalf("app sync: %v", err)
	}

	log.Fatal(http.ListenAndServe("127.0.0.1:8080", mux))
}
```

```console
$ curl localhost:8080/api/v1/hello/ada
{"message":"Hello, ada!"}

$ curl -sXPOST localhost:8080/api/v1/apps/hello/disable | head -c 60
{"apps":[{"key":"hello","name":"Hello","summary":"Greets who

$ curl localhost:8080/api/v1/hello/ada
{"error":{"code":"app_disabled","message":"The \"hello\" app is disabled on this instance. An administrator can enable it."},"meta":{"request_id":""}}
```

The passed-`nil` admin guard leaves the toggle routes unguarded, which is fine
for a demo and wrong for anything else — see
[the HTTP API](#the-http-api).

A fuller version of this, with all three ports implemented and a test suite
that exercises the round trip, is in
[`examples/hello-app/`](./examples/hello-app/):

```console
$ go run ./examples/hello-app
```

---

## The model

Four types carry the whole design.

| Type | What it is |
|---|---|
| [`Manifest`](./apps/manifest.go) | An app's declared identity: key, name, summary, category, `Core`, `DependsOn`. Data, not code — it is the row the host stores and the entry an Apps page renders. |
| [`App`](./apps/manifest.go) | A `Manifest` plus `Register func(Router)`, the closure that mounts the app's routes. |
| [`Router`](./apps/manifest.go) | Exactly two methods — `Handle` and `HandleFunc` — the subset of `*http.ServeMux` an app is allowed to use. `*http.ServeMux` satisfies it directly. |
| [`Registry`](./apps/registry.go) | The catalog for one process: the manifests compiled into this build, the records in the `Store`, the enablement cache, and the gate. |

The lifecycle is fixed and short. All of it happens at startup, before the
server accepts a connection:

```
NewRegistry(opts…)  →  Add(app)…  →  Validate()  →  Mount(mux)  →  Sync(ctx)  →  serve
```

After that the registry is read-mostly: `IsEnabled` on every gated request,
`List` and `SetEnabled` from the admin API.

**Why a closure instead of an interface.** `Register func(Router)` lets an app
take its own dependencies — a database handle, a client, a config struct — and
close over them, without the SDK knowing any of it. The app binds its own
middleware inside that closure too: auth, role guards, rate limits. The SDK
deliberately has no opinion about any of them.

---

## The three host ports

The SDK depends on abstractions and only abstractions. Everything it needs from
a host is stated as an interface the SDK owns, in
[`apps/ports.go`](./apps/ports.go). Nothing there names a database, an ORM, a
log framework, or an HTTP helper library — which is exactly what keeps the seam
dependency-free and lets a host of any shape, under any license, satisfy it.

### `Store` — persistence (required for the catalog)

```go
type Store interface {
	Upsert(ctx context.Context, manifests []Manifest) error
	Records(ctx context.Context) ([]Record, error)
	SetEnabled(ctx context.Context, key string, enabled bool) (found bool, err error)
}
```

Three domain-level methods, not a database handle. The reference host backs it
with one Postgres table; [`memstore`](./memstore/memstore.go) backs it with a
map in under a hundred lines, which is also the shortest complete answer to
"what does implementing this involve".

The contract, in full:

- **`Upsert`** inserts records that do not exist and refreshes the manifest
  columns of records that do. It must **never write `Enabled`** — an operator's
  setting survives every deploy — and must **never delete** anything, so
  records left behind by another build stay visible as orphans instead of being
  destroyed. New records are created enabled.
- **`Records`** returns every persisted record, orphans included, in any order.
  The SDK sorts.
- **`SetEnabled`** writes the enablement of exactly one record and reports
  whether one with that key existed. It must not create one: a key with no
  record has not been synced, and the SDK reports that as `ErrUnknownApp`
  rather than silently inventing an app.

Implementations must be safe for concurrent use — `Registry` calls `Records`
from request goroutines whenever its enablement cache expires.

A registry with **no** `Store` is a legitimate configuration, not an error: the
catalog still mounts and every app runs, because enablement fails open. It is
what an app's own tests should use. Only `Sync`, `List`, and `SetEnabled`
return `ErrNoStore`.

### `AuditSink` — governance (optional)

```go
type AuditSink interface {
	RecordToggle(ctx context.Context, event ToggleEvent)
}
```

Enabling or disabling an app changes what a deployment can do, so it is a
governance event rather than a log line. `RecordToggle` is called
synchronously, on the request goroutine, *after* the change is durable. Actor
identity is not a parameter — it travels in `ctx`, and the host extracts it
exactly as it does everywhere else.

`ToggleEvent.Action` is `ActionEnable` (`"app.enable"`) or `ActionDisable`
(`"app.disable"`); those strings are part of the stable contract so a host can
map them straight onto its own audit vocabulary. Use `AuditSinkFunc` to bridge
an existing function without declaring a type.

### `ErrorResponder` — HTTP errors (optional)

```go
type ErrorResponder interface {
	RespondError(w http.ResponseWriter, r *http.Request, message string, status int, err error)
}
```

Without this, `Handler` would have to invent a wire format, and the apps API
would look different from every other endpoint the host serves. Instead the
host passes its existing responder and the apps API becomes indistinguishable
from the rest of its surface. The signature is the conventional Go
error-responder shape, so most hosts can convert theirs in one expression:

```go
package host

import (
	"net/http"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
)

// respondError is the error helper your host already has, whatever it is
// called. err is for the server log; only message and status reach the client.
func respondError(w http.ResponseWriter, r *http.Request, message string, status int, err error) {
	// … render your envelope …
}

func mountAppsAPI(registry *apps.Registry, mux *http.ServeMux, adminGuard func(http.Handler) http.Handler) {
	apps.NewHandler(registry,
		apps.WithErrorResponder(apps.ErrorResponderFunc(respondError)),
	).RegisterRoutes(mux, adminGuard)
}
```

`err` is intended for the server-side log, not the client: leaking it is how
schema and service names escape. The default, `JSONErrorResponder`, is
stdlib-only and usable as a zero value, so the apps API works with no host
wiring at all.

---

## The public API surface

Everything exported by `github.com/FutureBuildAIinc/gable-sdk/apps`. This is
the surface the [stability policy](#stability-policy) applies to.

**Types**

| | |
|---|---|
| `Manifest` | An app's declared identity. `Validate() error`. |
| `App` | `Manifest` + `Register func(Router)`. |
| `Router` | `Handle`, `HandleFunc`. |
| `Registry` | `Add`, `AddStatic`, `Lookup`, `Manifests`, `Validate`, `Mount`, `Gate`, `Sync`, `IsEnabled`, `List`, `SetEnabled`. |
| `Record` | `Manifest` + `Enabled bool` — one persisted app. |
| `Status` | `Record` + `Orphaned bool` — one app as the catalog API reports it. |
| `Handler` | The HTTP API. `RegisterRoutes(mux Router, adminGuard func(http.Handler) http.Handler)`. |
| `Store`, `AuditSink`, `ErrorResponder` | The three host ports. |
| `AuditSinkFunc`, `ErrorResponderFunc` | Function adapters for two of them. |
| `JSONErrorResponder` | The built-in, stdlib-only `ErrorResponder`. |
| `ToggleEvent` | `Action`, `Key`, `Enabled`. |
| `DependencyError` | `Key`, `Enabling`, `Blockers` — recover with `errors.As`. |
| `Option`, `HandlerOption` | Functional option types. |

**Constructors and options**

| | |
|---|---|
| `NewRegistry(opts ...Option) *Registry` | |
| `WithStore`, `WithLogger`, `WithAuditSink`, `WithCacheTTL` | `Option` |
| `NewHandler(reg *Registry, opts ...HandlerOption) *Handler` | |
| `WithErrorResponder` | `HandlerOption` |

**Constants**

| | |
|---|---|
| `MaxKeyLength` = `64` | Longest accepted app key. |
| `DefaultCacheTTL` = `30 * time.Second` | Enablement cache TTL. |
| `CodeAppDisabled`, `CodeAppCore`, `CodeAppDependencyConflict` | Wire error codes. |
| `ActionEnable`, `ActionDisable` | Audit action strings. |

**Sentinel errors** — test with `errors.Is`; every error this package returns
is one of these or wraps one.

`ErrUnknownApp` · `ErrCoreApp` · `ErrNoStore` · `ErrInvalidManifest` ·
`ErrDuplicateKey` · `ErrUnknownDependency` · `ErrDependencyCycle`

**`github.com/FutureBuildAIinc/gable-sdk/memstore`** — `New(seed ...apps.Record) *Store`,
with `Upsert` / `Records` / `SetEnabled` / `Len`.

Full docs: [`go doc -all github.com/FutureBuildAIinc/gable-sdk/apps`](https://pkg.go.dev/github.com/FutureBuildAIinc/gable-sdk/apps).

### App keys

A key is the natural primary key in the host's catalog and travels in URLs and
JSON payloads, so the syntax is tight: a lowercase ASCII letter, then lowercase
letters, digits, or underscores, at most `MaxKeyLength` (64) characters.
`Manifest.Validate` enforces it.

Changing a key renames the app as far as an operator's saved enablement is
concerned. Pick it once.

### Panics

`Registry.Add` and `Registry.AddStatic` panic on an invalid manifest, a nil
`Register`, or a duplicate key. These are programmer errors in startup wiring,
detected before the process serves anything — the same contract, and the same
reasoning, as `http.ServeMux.Handle` panicking on a duplicate pattern. The
panic value is an `error` wrapping `ErrInvalidManifest` or `ErrDuplicateKey`.

Nothing in this package panics on a served request.

---

## Enablement semantics

Three behaviours are load-bearing, and each one is a decision rather than an
accident.

**Disable is a per-request gate, not an unregistration.** `http.ServeMux`
cannot unregister a pattern, and a gate makes a toggle take effect without
restarting the process. Every route registered through the `Router` that
`Mount` hands an app is wrapped; a disabled app's routes answer `404` with the
machine-readable code `app_disabled`. Use `Registry.Gate` to wrap a route
wired outside the registry — that is the escape hatch for a host converting a
legacy module in place.

**Enablement fails open.** An unknown key, a registry with no `Store`, and a
`Store` that returns an error all resolve to *enabled*. A catalog that cannot
be read is a reason to log, not a reason to take a working deployment offline.
Enablement is an install/uninstall switch, not an authorization mechanism —
access control is the host's job.

Reads go through a cache refreshed at most every `DefaultCacheTTL` (30s), which
bounds how long a toggle takes to reach every in-flight request.
`WithCacheTTL(0)` disables caching entirely: toggles become instantaneous,
every gated request reads the `Store`, and it is the right setting for tests
and the wrong one for production. A toggle made *through this process* busts
the cache immediately regardless.

**`Sync` never writes `Enabled` and never deletes.** Metadata refreshes from
code on every boot; enablement belongs to the operator. Records this build does
not recognise — from a rollback, a fork, or a branch with a different app set —
are left exactly as they are and reported as **orphans**, visible in `List` with
`Orphaned: true` and untoggleable from this build. Drift stays visible instead
of being destroyed.

### Dependencies

`DependsOn` names other **apps**, by key. Libraries and services that are not
themselves apps must not appear there.

It is enforced in both directions. Enabling requires every dependency to be
enabled; disabling is refused while an enabled app still depends on this one.
Core apps never block an enable, because they are always on by definition, and
they refuse to be disabled at all (`ErrCoreApp`). A refusal comes back as a
`*DependencyError` carrying the sorted `Blockers`, so a UI can point straight
at the apps responsible.

Validation reads current enablement straight from the `Store`, never the cache:
a decision this consequential must not be made against state up to a TTL old.

`Registry.Validate` is the whole-catalog check — every `DependsOn` key resolves,
and the graph is acyclic. It is advisory and never called automatically, because
a host that catalogs its apps incrementally may be legitimately incomplete
mid-startup. Call it once after the last `Add`.

---

## The HTTP API

`Handler.RegisterRoutes` mounts three routes:

| Route | Who |
|---|---|
| `GET /api/v1/apps` | Any authenticated caller — a client needs the catalog to build navigation. |
| `POST /api/v1/apps/{key}/enable` | Administrators. |
| `POST /api/v1/apps/{key}/disable` | Administrators. |

The `adminGuard` argument wraps the two mutating routes **and nothing else**.
Passing `nil` leaves them unguarded, which is appropriate only when the mux is
already behind an administrative guard.

Mount this on the host's own mux, **not** on a gated `Router`: the apps API has
to keep answering when apps are disabled, since it is how they get re-enabled.
It is platform surface, like `/metrics`, not an app.

Both a catalog read and a successful toggle return the full refreshed catalog,
so a client renders the result of a toggle without a second round trip:

```json
{"apps": [
  {"key": "gl", "name": "General Ledger", "summary": "…", "category": "Finance",
   "core": true, "depends_on": [], "enabled": true},
  {"key": "millwork", "name": "Millwork", "summary": "…", "category": "Sales",
   "core": false, "depends_on": ["product"], "enabled": false}
]}
```

An empty catalog serializes as `[]`, never `null`. Errors carry a
machine-readable `code` that clients switch on:

| Code | Status | Meaning |
|---|---|---|
| `app_disabled` | 404 | Returned by every route of a disabled app. Refresh your catalog. |
| `app_core` | 409 | This app is the platform spine and cannot be disabled. |
| `app_dependency_conflict` | 409 | The graph refuses the toggle; `blockers` names who. |

These three are a stable wire contract and will not change without a major
version.

---

## Testing an app

An app is testable against a plain `*http.ServeMux`, with no registry at all,
because `*http.ServeMux` satisfies `Router`:

```go
package hello_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
)

// The app under test: in a real project this comes from your package.
func helloApp() apps.App {
	return apps.App{
		Manifest: apps.Manifest{Key: "hello", Name: "Hello"},
		Register: func(r apps.Router) {
			r.HandleFunc("GET /api/v1/hello", func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte("hi"))
			})
		},
	}
}

func TestRoutes(t *testing.T) {
	mux := http.NewServeMux()
	helloApp().Register(mux) // *http.ServeMux is an apps.Router

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/hello", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
```

To test the *gating* as well, put a real registry in front of it with
`memstore` underneath — same code paths, same dependency validation, no
database:

```go
package hello_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
	"github.com/FutureBuildAIinc/gable-sdk/memstore"
)

func TestGatedWhenDisabled(t *testing.T) {
	ctx := context.Background()
	registry := apps.NewRegistry(
		apps.WithStore(memstore.New()),
		apps.WithCacheTTL(0), // no caching: a toggle is visible immediately
	)
	registry.Add(apps.App{
		Manifest: apps.Manifest{Key: "hello", Name: "Hello"},
		Register: func(r apps.Router) {
			r.HandleFunc("GET /api/v1/hello", func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte("hi"))
			})
		},
	})

	mux := http.NewServeMux()
	registry.Mount(mux)
	if err := registry.Sync(ctx); err != nil {
		t.Fatalf("sync: %v", err)
	}

	if err := registry.SetEnabled(ctx, "hello", false); err != nil {
		t.Fatalf("disable: %v", err)
	}

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/hello", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 while disabled", rec.Code)
	}
}
```

[`examples/hello-app/hello_test.go`](./examples/hello-app/hello_test.go) does
the same thing over the full HTTP surface, including the admin API and the
audit sink.

---

## Stability policy

**This module is `v0.x`. The surface is not frozen.**

The API is expected to be stable — it was extracted from code that has been
running in a production ERP, not designed on a whiteboard — but "expected to be
stable" and "committed to be stable" are different promises, and only the
second one is worth anything to someone building on it.

What that means concretely, while the major version is `0`:

- **A minor bump may contain a breaking change.** That is what
  [SemVer](https://semver.org/#spec-item-4) permits pre-1.0, and this module
  uses it. Pin an exact version.
- **Every breaking change is listed** in [`CHANGELOG.md`](./CHANGELOG.md) under
  `### Changed`, with the reason and the migration.
- **The wire contract is already frozen in practice.** The JSON shapes, the
  three routes, and the `app_disabled` / `app_core` /
  `app_dependency_conflict` codes have clients depending on them. They will not
  change in `v0.x`.
- **The ports are the least likely thing to move.** `Store`, `AuditSink`, and
  `ErrorResponder` are three, two, and one method; they are what a host has to
  write, and churning them is the most expensive thing this project could do.
  Growth happens through new `Option`s, which break nobody.

**The freeze condition:** this surface becomes `v1.0.0` when the host monorepo
has adopted it — when `gable/backend` imports this module instead of vendoring
`pkg/apps`, its own tests pass against it, and the couplings documented in
[`MIGRATION.md`](./MIGRATION.md) have been replaced by real adapters running in
production. Adoption is the thing that turns a designed API into a proven one,
and nothing else earns the 1.0.

Until then: use it, build on it, tell us what is wrong with it. It is far
cheaper to fix the shape of this now than after it is frozen.

---

## Repository layout

```
apps/                  the SDK
  doc.go               package overview and the design rationale
  manifest.go          Manifest, Router, App
  registry.go          Registry: catalog, cache, gate, sync, toggles
  handler.go           the HTTP API
  ports.go             Store, AuditSink, ErrorResponder + JSONErrorResponder
  errors.go            sentinel errors and DependencyError
memstore/              a conforming in-memory apps.Store
examples/hello-app/    a runnable host + one third-party app, with tests
LICENSES/              the license texts, per REUSE
CODE_OF_CONDUCT.md     Contributor Covenant 2.1
MIGRATION.md           how the Gable host adopts this module
```

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) — particularly the four rules, which
are the ones a review will check first. If you work with an AI assistant, there
is a companion guide,
[CONTRIBUTING-WITH-CLAUDE.md](./CONTRIBUTING-WITH-CLAUDE.md), and a Claude
agent kit in [`.claude/`](./.claude/) with slash commands for a repo tour, the
pre-flight, and writing a test.

The short version of the pre-flight:

```console
$ gofmt -l . && go vet ./... && go build ./... && go test -race ./...
$ go list -m all | wc -l    # must be 1
```

Please also read our [Code of Conduct](./CODE_OF_CONDUCT.md) — Contributor
Covenant 2.1, the same text the rest of the ecosystem uses.

**Security:** do not open a public issue for a vulnerability. See
[SECURITY.md](./SECURITY.md) — it goes privately to
[colton@futurebuild.ai](mailto:colton@futurebuild.ai).

## License

[OpenLBM Connector License 1.0](./LICENSE)
(`LicenseRef-OpenLBM-Connector-1.0`) — permissive, no copyleft. The license
texts are in [`LICENSES/`](./LICENSES/) and the mapping is machine-readable in
[`REUSE.toml`](./REUSE.toml).

The OpenLBM Standard is **published and effective at version 1.0**. The
canonical texts are at <https://github.com/FutureBuildAIinc/openlbm>; the copy
under `LICENSES/` is vendored so this repository is self-contained. Where the
two ever disagree, the published Standard governs.
