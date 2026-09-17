// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package main

import (
	"context"
	"log/slog"
	"net/http"
	"sync"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
	"github.com/FutureBuildAIinc/gable-sdk/memstore"
)

// This file is the part a host writes. It supplies the three ports — a
// [apps.Store], an [apps.AuditSink], and an [apps.ErrorResponder] — and wires
// the registry. A real host swaps memstore for its own database and its own
// audit and error plumbing; nothing else here changes.

// host is one process's app platform: the registry, the mux every route is
// mounted on, and the ports behind it.
type host struct {
	registry *apps.Registry
	mux      *http.ServeMux
	store    *memstore.Store
	audit    *auditLog
}

// newHost wires the platform and syncs the catalog, in the order the SDK
// expects: build the registry, add every app, validate, mount, expose the apps
// API, then sync.
func newHost(ctx context.Context, logger *slog.Logger) (*host, error) {
	// Port 1 — persistence. A production host implements apps.Store over its
	// own database; memstore is the same contract backed by a map.
	store := memstore.New()

	// Port 2 — governance. Toggling an app changes what the deployment can do,
	// so the change is an audit event, not a log line.
	audit := &auditLog{}

	registry := apps.NewRegistry(
		apps.WithStore(store),
		apps.WithAuditSink(audit),
		apps.WithLogger(logger),
	)

	registry.Add(newGreeter("Hello").App())

	// Advisory, and worth doing at startup: it is the only check that every
	// DependsOn key names an app that actually exists.
	if err := registry.Validate(); err != nil {
		return nil, err
	}

	mux := http.NewServeMux()

	// Mount puts every app's routes up behind the per-request enablement gate.
	registry.Mount(mux)

	// The apps API is platform surface, so it goes on the bare mux — it has to
	// keep answering when apps are disabled, since it is how they get turned
	// back on. Port 3, the error responder, is supplied here.
	apps.NewHandler(registry, apps.WithErrorResponder(apps.ErrorResponderFunc(respondError))).
		RegisterRoutes(mux, adminOnly)

	// Sync writes the compiled-in manifests to the store. It is deliberately
	// safe to fail: gating fails open, and the registry re-syncs itself when it
	// next finds the store empty.
	if err := registry.Sync(ctx); err != nil {
		return nil, err
	}

	return &host{registry: registry, mux: mux, store: store, audit: audit}, nil
}

// auditLog is this host's [apps.AuditSink]: it appends one line per committed
// toggle. A real host writes to its audit table and pulls the actor out of ctx.
type auditLog struct {
	mu     sync.Mutex
	events []apps.ToggleEvent
}

// RecordToggle implements [apps.AuditSink].
func (a *auditLog) RecordToggle(_ context.Context, event apps.ToggleEvent) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.events = append(a.events, event)
}

// entries returns a copy of everything recorded so far.
func (a *auditLog) entries() []apps.ToggleEvent {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]apps.ToggleEvent, len(a.events))
	copy(out, a.events)
	return out
}

// respondError is this host's [apps.ErrorResponder], adapted with
// [apps.ErrorResponderFunc]. The signature is the conventional Go
// error-responder shape, so most hosts can pass their existing helper directly.
// err is for the server log; only message and status reach the client.
func respondError(w http.ResponseWriter, _ *http.Request, message string, status int, err error) {
	if err != nil {
		slog.Error("hello-app: request failed", "message", message, "status", status, "error", err)
	}
	writeJSON(w, status, map[string]any{
		"ok":     false,
		"status": status,
		"detail": message,
	})
}

// adminOnly is the guard the apps API's two mutating routes ride behind.
// Listing the catalog stays open to any caller: a client needs it to build
// navigation. Real hosts pass their role middleware here.
func adminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Demo-Role") != "admin" {
			writeJSON(w, http.StatusForbidden, map[string]any{
				"ok":     false,
				"status": http.StatusForbidden,
				"detail": "administrator role required",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// compile-time proof that the host's ports satisfy the SDK's interfaces.
var (
	_ apps.AuditSink      = (*auditLog)(nil)
	_ apps.ErrorResponder = apps.ErrorResponderFunc(respondError)
	_ apps.Store          = (*memstore.Store)(nil)
)
