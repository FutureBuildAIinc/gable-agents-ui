<!--
SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
-->

# Changelog

All notable changes to the Gable Module SDK are recorded here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with the pre-1.0 caveat spelled out in the README's stability policy: while the
major version is `0`, a **minor** bump may contain a breaking change. The
current release is named in [`VERSION`](./VERSION).

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-08-07

First release. The installable-apps layer of the Gable ERP, extracted from
`github.com/gablelbm/gable/pkg/apps` (the `backend/pkg/apps` directory of the
host repository) into a standalone,
Connector-licensed Go module so a third party can write an app — under any
license — without a copyleft obligation crossing the seam.

### Added

- **`apps`** — the SDK proper.
  - `Manifest`, `App`, and `Router`: an app's declared identity and the
    two-method registration surface it is handed.
  - `Manifest.Validate` enforces the key syntax (lowercase ASCII, digits and
    underscores after the first character, `MaxKeyLength` = 64) and rejects
    blank, duplicated, self-referential, and malformed dependencies.
  - `Registry` with functional options (`WithStore`, `WithLogger`,
    `WithAuditSink`, `WithCacheTTL`): `Add`, `AddStatic`, `Lookup`,
    `Manifests`, `Validate`, `Mount`, `Gate`, `Sync`, `IsEnabled`, `List`,
    `SetEnabled`.
  - `Registry.Validate` checks the catalog as a whole — every dependency
    resolves, and the graph is acyclic (iterative DFS, so a pathological
    catalog cannot exhaust the stack).
  - `Handler` serving `GET /api/v1/apps`, `POST /api/v1/apps/{key}/enable`,
    and `POST /api/v1/apps/{key}/disable`, with the admin guard applied to the
    two mutating routes only.
  - Sentinel errors `ErrUnknownApp`, `ErrCoreApp`, `ErrNoStore`,
    `ErrInvalidManifest`, `ErrDuplicateKey`, `ErrUnknownDependency`,
    `ErrDependencyCycle`, and the structured `DependencyError`.
  - Wire-contract codes `app_disabled`, `app_core`,
    `app_dependency_conflict`.
- **The three host ports**, all SDK-owned interfaces:
  - `Store` — persistence for the app catalog (`Upsert`, `Records`,
    `SetEnabled`), replacing the direct `pkg/database` coupling.
  - `AuditSink` (+ `AuditSinkFunc`, `ToggleEvent`, `ActionEnable`,
    `ActionDisable`) — replacing the direct `pkg/audit` coupling.
  - `ErrorResponder` (+ `ErrorResponderFunc`, and the stdlib-only default
    `JSONErrorResponder`) — replacing the direct `pkg/httputil` coupling.
- **`memstore`** — a conforming in-memory `apps.Store`, so an app can be
  developed and tested against the real registry with no database at all.
- **`examples/hello-app`** — a complete, runnable host plus one third-party
  app, sharing nothing but the SDK. It is the proof the seam stands alone.
- **[`MIGRATION.md`](./MIGRATION.md)** — how `gable/backend` adopts this
  module: the `require` line, a `go.work` for local development, the import
  rewrites, and adapter shims for the three broken couplings.

### Changed from the in-tree original

Behaviour is preserved except where noted; these are the differences a host
will notice when it adopts the module.

- **Zero third-party dependencies.** The original imported
  `github.com/jackc/pgx/v5` (transitively, via `pkg/database`) and
  `github.com/google/uuid`. This module's `go.mod` has no `require` block at
  all, which is what makes the permissive license a real promise rather than a
  claim.
- **Persistence is a port, not a `*database.DB`.** `Sync`, `List`, and
  `SetEnabled` issue no SQL. The reference host's `apps` table (migration 074)
  is one valid `Store`; a map is another.
- **`Add` and `AddStatic` validate.** The original panicked only on a duplicate
  key. Both now also panic on an invalid manifest or a nil `Register`, with an
  `error` panic value wrapping `ErrInvalidManifest` or `ErrDuplicateKey`
  rather than a bare string.
- **`Registry.Validate` is new.** The original had no whole-catalog check;
  an unresolvable `DependsOn` entry was silent.
- **`Registry.Gate` is exported.** The original's `gate` was unexported, so a
  route wired outside the registry could not be gated during a conversion.
- **`Status` embeds `Record`** (manifest + `Enabled`) instead of `Manifest` +
  a loose `Enabled` field. The JSON is byte-for-byte the same: both embedded
  structs are anonymous, so it still marshals flat.
- **Self-heal is store-agnostic.** The original detected an empty table with
  `SELECT EXISTS(SELECT 1 FROM apps)`; the registry now infers it from a
  zero-length `Records` result and rate-limits re-sync attempts to one per
  `DefaultCacheTTL`.
- **`WithCacheTTL(0)` disables caching** so tests see toggles instantly. The
  original's 30s TTL was a constant.
- **Sorting is total.** `List` breaks a category+name tie on the key, so the
  order is deterministic where the original's `sort.Slice` was not.
- **The disabled-app message no longer names the host's UI.** It was
  "An administrator can enable it under Tech Admin → Apps"; it is now "An
  administrator can enable it." The `app_disabled` code is unchanged.

[Unreleased]: https://github.com/FutureBuildAIinc/gable-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/FutureBuildAIinc/gable-sdk/releases/tag/v0.1.0
