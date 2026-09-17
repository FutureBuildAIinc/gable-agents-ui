// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

// Package apps is the Gable Module SDK: the plug-in seam an OpenLBM host
// exposes to installable apps.
//
// An app is a self-contained vertical slice — a [Manifest] declaring its
// identity plus a registration closure that mounts its HTTP routes. A host
// builds a [Registry], adds apps to it, mounts them, and exposes the
// enable/disable API through [Handler]. Operators toggle apps at runtime; the
// registry gates every route the app registered.
//
// # Why this package is permissively licensed
//
// This is the connector seam of the OpenLBM Standard. It is licensed under the
// OpenLBM Connector License (concept lineage Apache-2.0, no copyleft) so a
// third party can write an app — under any license, open or closed — and plug
// it into a copyleft host without a license crossing the boundary. Keeping
// that promise is why this package has zero third-party dependencies and never
// imports anything from the host.
//
// # The three host ports
//
// The SDK depends on abstractions, never on a host's concrete substrate. A
// host supplies:
//
//   - [Store] — persistence for the app catalog (3 methods; the reference
//     host backs it with a Postgres table, but a map is enough).
//   - [AuditSink] — optional; receives a [ToggleEvent] each time an app is
//     enabled or disabled, so toggles land in the host's governance log.
//   - [ErrorResponder] — optional; renders HTTP errors in the host's own
//     envelope. Defaults to [JSONErrorResponder], which needs no host at all.
//
// Everything else is stdlib. [Router] is the subset of [net/http.ServeMux]
// apps are allowed to use, and *http.ServeMux satisfies it directly.
//
// # Minimal host
//
//	store := memstore.New()                     // or your own apps.Store
//	reg := apps.NewRegistry(apps.WithStore(store))
//	reg.Add(apps.App{
//		Manifest: apps.Manifest{Key: "hello", Name: "Hello", Category: "Demo"},
//		Register: func(r apps.Router) {
//			r.HandleFunc("GET /api/v1/hello", helloHandler)
//		},
//	})
//
//	mux := http.NewServeMux()
//	reg.Mount(mux)                              // routes go up, gated
//	apps.NewHandler(reg).RegisterRoutes(mux, adminOnly)
//	_ = reg.Sync(ctx)                           // manifests -> Store
//
// # Enablement semantics
//
//   - Disable is enforced per request, not by unregistering routes:
//     [net/http.ServeMux] cannot unregister a pattern, and a per-request gate
//     makes toggles take effect without a restart. A disabled app's routes
//     answer 404 with the machine-readable code app_disabled.
//   - Enablement is read through a short-TTL cache ([DefaultCacheTTL]) and
//     fails open: an unknown key, a missing Store, or a Store error all resolve
//     to enabled. The registry must never take a working host down.
//   - [Registry.Sync] never deletes rows and never writes the Enabled column.
//     Enablement is operator-owned state; metadata refreshes from code.
//
// # Stability
//
// v0.x. The surface is expected to be stable but is not frozen until a host
// has adopted it; see the stability policy in the repository README.
package apps
