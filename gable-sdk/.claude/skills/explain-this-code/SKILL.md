---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
name: explain-this-code
description: Orient a newcomer in the Gable Module SDK — the apps package, the Manifest/Registry/Handler triangle, the three host ports (Store, AuditSink, ErrorResponder), the Router subset, and why the package has zero third-party dependencies. Use when the user says "where do I start", "how does this SDK work", "give me a tour", "I'm new here", "how do I write an app", "what is the connector seam", "how does enable/disable work", "explain the architecture", "/newcomer-tour", or asks what any file or type does.
---

# explain-this-code — the Module SDK, and how to read it yourself

Two jobs, in this order: **answer what they asked**, with real files and line numbers, then
**teach the lookup** so they don't need you next time.

The good news about this repo: it is small, dependency-free, and heavily documented in the
source. Almost every question is answered by `go doc`.

---

## Start here, literally

```bash
go doc ./apps                 # the package overview — read this first, it is the design doc
go doc ./apps Manifest
go doc ./apps Registry
go doc ./apps Store
```

`apps/doc.go` is the package documentation and it explains the model better than any summary:
what an app is, why the package is permissively licensed, the three host ports, a minimal
host, and the enablement semantics. **Read it before answering anything.**

## The map

```bash
ls
ls apps/ memstore/ examples/ 2>/dev/null
cat go.mod
```

```
gable-sdk/
  go.mod          module github.com/FutureBuildAIinc/gable-sdk — Go 1.25, ZERO dependencies
  apps/           the SDK itself
    doc.go        package documentation — the design, in prose
    manifest.go   Manifest: an app's declared identity, and Validate
    registry.go   Registry: holds apps, mounts routes, gates them, syncs to the Store
    handler.go    Handler: the enable/disable HTTP API
    ports.go      the host ports — Store, AuditSink, ErrorResponder, Router
    errors.go     the error values and machine-readable codes
    *_test.go     manifest_test.go, registry_test.go, fakes_test.go
  memstore/       a map-backed Store — the reference implementation and the test double
  LICENSES/       LicenseRef-OpenLBM-Connector-1.0.txt
```

## The one-paragraph model

An **app** is a self-contained vertical slice: a `Manifest` declaring its identity plus a
registration closure that mounts its HTTP routes. A **host** builds a `Registry`, adds apps to
it, calls `Mount`, exposes the enable/disable API through `Handler`, and calls `Sync` to push
manifests into its `Store`. Operators toggle apps at runtime, and the registry gates every
route the app registered.

That's the whole thing. Everything else is a consequence.

## Why there are no dependencies

`go.mod` has no `require` block, and that is **load-bearing, not an accident**. This package is
the connector seam of the OpenLBM Standard: it is licensed permissively so a third party can
write an app under any licence — open or closed — and plug it into a copyleft host without a
licence crossing the boundary. Keeping that promise is why the package has zero third-party
dependencies and never imports anything from the host.

So: **adding a dependency here is a licensing decision, not a convenience decision.** If
someone asks "can I just pull in X?", the answer is almost always no, and the reason is in
`apps/doc.go` § "Why this package is permissively licensed".

## The three ports — how "depends on abstractions" is actually done

Read `apps/ports.go`. It's the most instructive file in the repo. Everything the SDK needs from
a host is stated as an interface the SDK owns. Nothing there names a database, an ORM, a log
framework, or an HTTP helper.

| Port | Required? | What a host supplies |
|---|---|---|
| `Store` | yes (in practice) | Persistence for the app catalogue — **three domain methods**, not a DB handle. The reference host uses one Postgres table; a map is a complete implementation (`memstore`). |
| `AuditSink` | optional | Receives a `ToggleEvent` on every enable/disable so toggles land in the host's governance log. |
| `ErrorResponder` | optional | Renders HTTP errors in the host's own envelope. Defaults to `JSONErrorResponder`, which needs no host at all. |

`Router` is the fourth abstraction and the subtlest: it's the **subset of `net/http.ServeMux`
that apps are allowed to use**, and `*http.ServeMux` satisfies it directly. That's how the SDK
constrains what an app can do to a host's mux without wrapping it.

## The invariants that will bite you

These are the rules the tests exist to protect. Quote them when someone proposes a change:

- **Disable is enforced per request, not by unregistering routes.** `net/http.ServeMux` cannot
  unregister a pattern, and a per-request gate makes toggles take effect without a restart. A
  disabled app's routes answer **404** with the machine-readable code **`app_disabled`**.
- **Enablement is read through a short-TTL cache and fails open.** An unknown key, a missing
  `Store`, or a `Store` error all resolve to **enabled**. *The registry must never take a
  working host down.* This is deliberate, and a PR that makes it fail closed is changing a
  design decision, not fixing a bug.
- **`Registry.Sync` never deletes rows and never writes the `Enabled` column.** Enablement is
  operator-owned state; metadata refreshes from code. Records left behind by another build stay
  visible as orphans rather than being destroyed.
- **`Store.Upsert` must never write `Enabled`.** Same reason: an operator's setting survives
  every deploy.
- **`SetEnabled` must not create a record.** A key with no record hasn't been synced, and the
  SDK reports `ErrUnknownApp` rather than inventing an app.
- **`Manifest.Key` is a natural primary key.** Lowercase ASCII letter first, then lowercase
  letters, digits, or underscores, at most `MaxKeyLength` (64) characters. Changing a key
  renames the app as far as the operator's saved enablement is concerned — pick it once.
- **`Core` apps cannot be disabled.**

## Answering "how do I write an app?"

```go
var App = apps.Manifest{
    Key:       "millwork",
    Name:      "Millwork",
    Summary:   "Door, window, and trim configuration.",
    Category:  "Operations",
    DependsOn: []string{"product"},
}
```

Then a host adds it:

```go
store := memstore.New()                     // or your own apps.Store
reg := apps.NewRegistry(apps.WithStore(store))
reg.Add(apps.App{
    Manifest: App,
    Register: func(r apps.Router) {
        r.HandleFunc("GET /api/v1/millwork/...", handler)
    },
})

mux := http.NewServeMux()
reg.Mount(mux)                              // routes go up, gated
apps.NewHandler(reg).RegisterRoutes(mux, adminOnly)
_ = reg.Sync(ctx)                           // manifests -> Store
```

Check `examples/` for a runnable version (`ls examples/`) — if it's there, point them at it
rather than at this snippet.

## How this relates to the reference host

The reference implementation is `FutureBuildAIinc/gable`, where the same seam lives at
`backend/pkg/apps/` and modules under `backend/internal/` are being converted to apps one at a
time. Useful context, not a dependency — **the SDK never imports the host**.

```bash
git clone --depth 1 https://github.com/FutureBuildAIinc/gable.git /tmp/gable
ls /tmp/gable/backend/pkg/apps/
cat /tmp/gable/docs/modularization-blueprint.md      # the conversion recipe and phases
```

## Stability

**v0.x.** The surface is expected to be stable but is not frozen until a host has adopted it.
Check the repository README for the current stability policy before telling anyone an API is
safe to depend on.

---

## Ground rules

- **Read `go doc ./apps` and `apps/doc.go` before answering.** The design is written down.
- **Show real paths and line numbers**, not "the registry".
- **Quote the invariant** when a proposed change would break one. Several of them look like
  bugs and are not.
- **Never suggest adding a dependency** without flagging it as a licensing decision.
- **End with the lookup** — `go doc ./apps <Type>` is the answer to most questions here.
