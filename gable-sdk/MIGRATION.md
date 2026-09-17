<!--
SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
-->

# Migrating `gable/backend` onto the SDK

How the host monorepo stops carrying its own `pkg/apps` and depends on this
module instead.

The host's Go module path is `github.com/gablelbm/gable`, which is *not* where
the repository lives — that is <https://github.com/FutureBuildAIinc/gable>. The
module path is frozen for compatibility, so every host import path below is
correct as written even though `go get github.com/gablelbm/gable` does not
resolve. Work from a checkout — see
[`go.work` for local development](#2-optional-gowork-for-local-development) and
the scratch module in [Verification](#verification).

It closes the last structural gap in the apps seam: `pkg/apps` carried the
Connector licence and behaved like an SDK, but it was not separately versioned
or independently consumable, so no third party could actually depend on it.
The change is mechanical but it crosses a licence boundary, so it is written
down and applied in one reviewed pass rather than drifted into.

**Status of this document:** every Go snippet below was compiled against the
real host packages and the real SDK before publication — see
[Verification](#verification). The one thing it cannot prove is runtime
behaviour against Postgres, because the SQL is carried over verbatim rather
than rewritten. Read [Risks](#risks) before you start.

---

## Why

`backend/pkg/apps/` is the connector seam: the surface a third party writes an
installable app against. `LICENSE-MAP.md` already carves it out of the
`backend/pkg/` Commons default and licenses it under OpenLBM Connector, so a
plug-in author does not inherit copyleft by building against it.

That promise is only real if the seam is genuinely separable. While it lives
inside the monorepo and imports `pkg/database`, `pkg/audit` and `pkg/httputil`,
an app author compiling against it pulls the commons in behind it — pgx and
all — and the licence boundary is a comment rather than a fact.

Extracting it to a module with **zero dependencies** makes the boundary
structural. The SDK's CI enforces it: the build fails if `go.mod` grows a
`require` block, if a `go.sum` appears, or if any non-stdlib package enters the
graph.

---

## What changes

The couplings were broken by inverting them. The SDK now declares three ports
in [`apps/ports.go`](apps/ports.go) and the host supplies implementations.

| Coupling in the host today | Port the SDK declares | What the host now passes |
|---|---|---|
| `registry.go` → `pkg/database` | `apps.Store` | `appsstore.Store` — a new host package holding the SQL |
| `registry.go` → `pkg/audit` | `apps.AuditSink` | `appsstore.AuditSink(auditLog)` |
| `handler.go` → `pkg/httputil` | `apps.ErrorResponder` | `apps.ErrorResponderFunc(httputil.RespondError)` |

The SDK issues no queries and knows no schema. `appsstore` is host code, under
the Commons licence, and is where `apps` table knowledge now lives.

### API delta

| Before (`pkg/apps`) | After (`gable-sdk/apps`) |
|---|---|
| `apps.NewRegistry(db, logger)` | `apps.NewRegistry(apps.WithStore(…), apps.WithLogger(…))` |
| `.WithAudit(auditLog)` (chained) | `apps.WithAuditSink(…)` (option) |
| `apps.NewHandler(reg)` | `apps.NewHandler(reg, apps.WithErrorResponder(…))` |
| `errors.New("apps: registry has no database")` | `apps.ErrNoStore` |
| `r.gate(…)` (unexported) | `r.Gate(key, handler)` (exported) |
| — | new: `Lookup`, `Manifests`, `Validate`, `WithCacheTTL` |

`Manifest`, `App`, `Router`, `Status` and `DependencyError` are unchanged in
shape. `Router` is still the same two-method interface, so `*http.ServeMux`
continues to satisfy it and no app's `Register` closure changes.

Behaviour that is **preserved**, verified by reading both implementations:
orphan detection and warning, empty-store self-heal on first boot, fail-open
gating when the store is unavailable, and core-app / dependency-graph toggle
validation.

---

## Procedure

### 0. Prerequisite — the SDK must be fetchable

Until `v0.1.0` is tagged and pushed to `github.com/FutureBuildAIinc/gable-sdk`,
the host can only resolve it through a `replace` or a `go.work`, and **CI
cannot build the host at all**. Tag and push the SDK first, or accept that the
host build is local-only until you do. This is the one step that cannot be
worked around — see [Risks](#risks).

```bash
# in gable-sdk
git tag v0.1.0 && git push origin v0.1.0
```

### 1. Add the dependency

```bash
cd backend
go get github.com/FutureBuildAIinc/gable-sdk@v0.1.0
```

`backend/go.mod` gains:

```
require github.com/FutureBuildAIinc/gable-sdk v0.1.0
```

**Verify:** `go list -m github.com/FutureBuildAIinc/gable-sdk`

### 2. (Optional) `go.work` for local development

To develop the host against an uncommitted SDK checkout, at the repo root:

```
go 1.25

use (
	./backend
	../gable-sdk
)
```

**Do not commit it** — add `go.work` and `go.work.sum` to `.gitignore`. A
committed `go.work` silently overrides the pinned version for everyone,
including CI, which is exactly the reproducibility hole the SDK's pinned-tool
policy exists to avoid.

### 3. Add the host adapter

New file `backend/pkg/appsstore/store.go`. This lands under `backend/pkg/`, so
it is **Commons**-licensed, not Connector — it is host code that names the
host's schema.

<!-- REUSE-IgnoreStart -->

```go
// SPDX-License-Identifier: LicenseRef-OpenLBM-Commons-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

// Package appsstore backs the SDK's apps.Store port with the host's Postgres
// pool. It is host code: it names the schema, so the SDK does not have to.
package appsstore

import (
	"context"
	"fmt"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Store implements apps.Store over the `apps` table (migration 074).
type Store struct{ db *database.DB }

// New returns a Store backed by db.
func New(db *database.DB) *Store { return &Store{db: db} }

// Upsert refreshes the manifest columns and never writes `enabled`.
func (s *Store) Upsert(ctx context.Context, manifests []apps.Manifest) error {
	for _, m := range manifests {
		deps := m.DependsOn
		if deps == nil {
			deps = []string{}
		}
		_, err := s.db.Pool.Exec(ctx, `
			INSERT INTO apps (key, name, summary, category, core, depends_on)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (key) DO UPDATE SET
				name = EXCLUDED.name,
				summary = EXCLUDED.summary,
				category = EXCLUDED.category,
				core = EXCLUDED.core,
				depends_on = EXCLUDED.depends_on,
				updated_at = NOW()`,
			m.Key, m.Name, m.Summary, m.Category, m.Core, deps)
		if err != nil {
			return fmt.Errorf("appsstore: upsert %q: %w", m.Key, err)
		}
	}
	return nil
}

// Records returns every persisted record, orphans included.
func (s *Store) Records(ctx context.Context) ([]apps.Record, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT key, name, summary, category, core, enabled, depends_on FROM apps`)
	if err != nil {
		return nil, fmt.Errorf("appsstore: records: %w", err)
	}
	defer rows.Close()

	out := []apps.Record{}
	for rows.Next() {
		var rec apps.Record
		if err := rows.Scan(&rec.Key, &rec.Name, &rec.Summary,
			&rec.Category, &rec.Core, &rec.Enabled, &rec.DependsOn); err != nil {
			return nil, fmt.Errorf("appsstore: records scan: %w", err)
		}
		out = append(out, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("appsstore: records: %w", err)
	}
	return out, nil
}

// SetEnabled writes one record's enablement and reports whether it existed.
func (s *Store) SetEnabled(ctx context.Context, key string, enabled bool) (bool, error) {
	tag, err := s.db.Pool.Exec(ctx,
		`UPDATE apps SET enabled = $2, updated_at = NOW() WHERE key = $1`, key, enabled)
	if err != nil {
		return false, fmt.Errorf("appsstore: set enabled %q: %w", key, err)
	}
	return tag.RowsAffected() > 0, nil
}

// AuditSink bridges SDK toggle events onto the host's governance log.
func AuditSink(log *audit.Logger) apps.AuditSink {
	return apps.AuditSinkFunc(func(ctx context.Context, ev apps.ToggleEvent) {
		log.Log(ctx, audit.Entry{
			Action:     ev.Action, // already "app.enable" / "app.disable"
			EntityType: "app",
			EntityID:   uuid.Nil, // apps use TEXT natural keys; key travels in Changes
			Changes:    map[string]interface{}{"key": ev.Key, "enabled": ev.Enabled},
		})
	})
}
```

<!-- REUSE-IgnoreEnd -->

The SQL is carried over unchanged from `pkg/apps/registry.go` (lines 145-155,
290, 355). The `Action` string needs no mapping: the SDK's `ActionEnable` /
`ActionDisable` constants are already `"app.enable"` / `"app.disable"`, the
same literals the host's audit rows use today.

**Verify:** `go build ./pkg/appsstore/`

### 4. Rewrite the imports

Exactly seven files import `pkg/apps`. Produced by:

```bash
grep -rn "gablelbm/gable/pkg/apps" --include='*.go' backend/
```

```
backend/cmd/server/catalog.go:6
backend/cmd/server/main.go:60
backend/internal/millwork/manifest.go:6
backend/internal/millwork/handler.go:10
backend/internal/governance/manifest.go:6
backend/internal/governance/handler.go:10
backend/internal/configurator/handler.go:10
```

```bash
cd backend
grep -rl "gablelbm/gable/pkg/apps" --include='*.go' . \
  | xargs sed -i 's|github.com/gablelbm/gable/pkg/apps|github.com/FutureBuildAIinc/gable-sdk/apps|g'
gofmt -w .
```

The package name stays `apps`, so no identifier in any of those files changes —
only the import path. The five files under `internal/` need nothing else.

**Verify:** `grep -rn "gablelbm/gable/pkg/apps" --include='*.go' .` returns nothing.

### 5. Update the wiring in `main.go`

Two call sites change. Currently at `main.go:169` and `main.go:644`:

```diff
-	appRegistry := apps.NewRegistry(db, logger).WithAudit(auditLog)
+	appRegistry := apps.NewRegistry(
+		apps.WithStore(appsstore.New(db)),
+		apps.WithAuditSink(appsstore.AuditSink(auditLog)),
+		apps.WithLogger(logger),
+	)
```

```diff
-	apps.NewHandler(appRegistry).RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))
+	apps.NewHandler(appRegistry,
+		apps.WithErrorResponder(apps.ErrorResponderFunc(httputil.RespondError)),
+	).RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))
```

Add the import:

```diff
 	"github.com/FutureBuildAIinc/gable-sdk/apps"
+	"github.com/gablelbm/gable/pkg/appsstore"
```

`WithErrorResponder` is optional. Omitting it uses the SDK's built-in
`JSONErrorResponder`, whose envelope and status-code mapping were written to
match `httputil.RespondError` — but passing the host's own responder is the
honest wiring and guarantees the apps API keeps matching the rest of the
surface if `httputil` ever changes.

**Verify:** `go build ./... && go vet ./...`

### 6. Delete the old package

```bash
git rm -r backend/pkg/apps/
```

That removes `apps.go`, `handler.go`, `registry.go` and `registry_test.go`.

Before deleting `registry_test.go`, diff its cases against the SDK's
`apps/registry_test.go` and `apps/manifest_test.go`. Anything it covers that
the SDK does not should move into the SDK first — deleting host tests to make
a migration compile is how coverage quietly disappears.

**Verify:** `go build ./... && go test -race ./...`

### 7. Update `REUSE.toml`

The Connector carve-out at `backend/pkg/apps/**` now points at nothing. Remove
that annotation block. Do **not** add one for `backend/pkg/appsstore/` — it
correctly inherits Commons from the `backend/pkg/**` default, which is the
whole point of it being host code.

Update `LICENSE-MAP.md` in the same commit: the `backend/pkg/apps/` row should
say the connector seam now lives in the `gable-sdk` repo, so a reader is not
sent looking for a directory that no longer exists.

**Verify:** `reuse lint` (or `python3 .github/scripts/reuse_gate.py`)

### 8. Full gate

```bash
cd backend && go build ./... && go vet ./... && go test -race ./...
cd ../app && npx tsc --noEmit && npm run lint && npm run test
cd .. && python3 .github/scripts/reuse_gate.py
```

Then boot it and confirm the Apps page still lists every app, a toggle still
persists, and an audit row is still written.

---

## Rollback

Nothing here touches the database — the schema, the SQL and the `apps` table
are identical before and after — so rollback is purely a code revert:

```bash
git revert <merge-commit>   # or: git checkout <sha> -- backend/pkg/apps backend/cmd/server
cd backend && go mod tidy
```

Operator enablement state is untouched by the migration and by the revert.
There is no data migration to undo and no window in which the table is in an
intermediate shape.

---

## Verification

Every Go block above was compiled — not eyeballed — against the real packages,
in a scratch module outside both repositories:

```
module migcheck
go 1.25
require (
	github.com/FutureBuildAIinc/gable-sdk v0.0.0
	github.com/gablelbm/gable v0.0.0
)
replace github.com/FutureBuildAIinc/gable-sdk => ../gable-sdk
replace github.com/gablelbm/gable => ../gable/backend
```

with `appsstore/store.go` verbatim from step 3 and a `wiring.go` reproducing
step 5's post-migration calls. Both `go build ./...` and `go vet ./...` pass.
This confirms the adapter satisfies `apps.Store` and `apps.AuditSink`, that
`httputil.RespondError` converts directly to `apps.ErrorResponderFunc`, and
that every option named in step 5 exists with the signature shown.

---

## Risks

**The SDK must be tagged before host CI can build.** This is the real blocker,
not a caveat. `go get` on an untagged module fails, and a `go.work` cannot be
committed without breaking reproducibility. Sequence it: tag and push
`v0.1.0`, then open the host PR.

**The SQL is carried over, not re-verified against a live database.** Steps 3's
statements are byte-equivalent to the host's current ones, and the shim
compiles, but nothing in this document proves they still behave correctly at
runtime. The `apps` table has no test coverage in the host today. Run step 8's
boot check on a real database before merging — this is the single most likely
place for a silent defect.

**`Records` returns every row on each cache refresh**, where the host's
`refreshCache` selected only `WHERE enabled = FALSE`. On a catalog of ~40 apps
refreshed every 30s that is negligible, but it is a real change in read volume
and worth knowing if the catalog ever grows large. `WithCacheTTL` tunes it.

**Coverage can silently drop at step 6.** `pkg/apps/registry_test.go` is
deleted. The SDK has its own tests, but I have not diffed the two case-by-case
— that comparison is a genuine review task, not a formality.

**`v0.1.0` is pre-1.0 and the surface is not frozen.** The SDK's stability
policy says the API may change until the host adopts it. This migration *is*
that adoption, so treat the resulting version as the point at which the
surface should be frozen and tagged `v1.0.0`.

**Not attempted here:** the `pkg/middleware/partner_auth.go` → `internal/customer`
upward leak — a package under `pkg/*` reaching up into `internal/*`, which is
the wrong direction for a substrate. It does not touch the apps seam and is
independent of this migration, but it remains the last thing standing between
`pkg/*` and being a clean self-contained substrate.
