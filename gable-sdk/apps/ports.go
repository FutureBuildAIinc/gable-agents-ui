// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
)

// This file defines the ports — everything the SDK needs from a host, stated
// as an interface the SDK owns. Nothing here names a database, an ORM, a log
// framework, or an HTTP helper library. That is the point: it is what keeps
// the connector seam dependency-free and lets a host of any shape, under any
// license, satisfy it.

// -----------------------------------------------------------------------------
// Persistence
// -----------------------------------------------------------------------------

// Record is one persisted app: its manifest as last synced from code, plus the
// operator-owned enablement flag.
//
// The manifest fields are a cache of what the running build declared; Enabled
// is the only column that belongs to the operator, and the only one the SDK
// ever asks a Store to change.
type Record struct {
	Manifest
	// Enabled is the operator's setting. [Store.Upsert] must never write it.
	Enabled bool `json:"enabled"`
}

// Store is the persistence port: where the app catalog lives between restarts.
//
// It is deliberately three domain-level methods rather than a database handle.
// A host backs it with whatever it already uses — the reference host uses one
// Postgres table — and a map is a complete implementation (see the memstore
// package). The SDK issues no queries and knows no schema.
//
// Implementations must be safe for concurrent use: [Registry] calls Records
// from request goroutines whenever its enablement cache expires.
//
// The contract:
//
//   - Upsert inserts records that do not exist and refreshes the manifest
//     columns of records that do. It must never write Enabled — an operator's
//     setting survives every deploy — and must never delete anything, so that
//     records left behind by another build stay visible as orphans instead of
//     being destroyed. New records are created enabled.
//   - Records returns every persisted record, orphans included, in any order.
//     The SDK sorts.
//   - SetEnabled writes the enablement of exactly one record and reports
//     whether a record with that key existed. It must not create one: a key
//     with no record has not been synced, and the SDK reports that as
//     [ErrUnknownApp] rather than silently inventing an app.
type Store interface {
	Upsert(ctx context.Context, manifests []Manifest) error
	Records(ctx context.Context) ([]Record, error)
	SetEnabled(ctx context.Context, key string, enabled bool) (found bool, err error)
}

// -----------------------------------------------------------------------------
// Audit
// -----------------------------------------------------------------------------

// Audit action strings carried by [ToggleEvent.Action]. They are part of the
// SDK's stable contract: a host can map them straight onto its own governance
// log without deriving them from the boolean.
const (
	// ActionEnable is the [ToggleEvent.Action] for an app being turned on.
	ActionEnable = "app.enable"
	// ActionDisable is the [ToggleEvent.Action] for an app being turned off.
	ActionDisable = "app.disable"
)

// ToggleEvent describes an enablement change that has already been committed
// to the [Store]. It is the only event the SDK emits.
type ToggleEvent struct {
	// Action is [ActionEnable] or [ActionDisable].
	Action string
	// Key is the app that changed.
	Key string
	// Enabled is the new state.
	Enabled bool
}

// AuditSink receives an event for every committed app toggle.
//
// Enabling or disabling an app changes what a deployment can do, so it is a
// governance event, not a log line — a host that keeps an audit trail should
// route these into it. The sink is optional; a registry without one simply
// does not record toggles.
//
// RecordToggle is called synchronously on the request goroutine, after the
// change is durable. It must not block for long and must not panic. Actor
// identity is not a parameter: it travels in ctx, which is the request's
// context, and the host extracts it exactly as it does everywhere else.
type AuditSink interface {
	RecordToggle(ctx context.Context, event ToggleEvent)
}

// AuditSinkFunc adapts a plain function to [AuditSink], so a host can bridge
// to its existing audit logger in one expression rather than declaring a type.
type AuditSinkFunc func(ctx context.Context, event ToggleEvent)

// RecordToggle implements [AuditSink].
func (f AuditSinkFunc) RecordToggle(ctx context.Context, event ToggleEvent) { f(ctx, event) }

// -----------------------------------------------------------------------------
// HTTP errors
// -----------------------------------------------------------------------------

// ErrorResponder renders an HTTP error in the host's own envelope.
//
// [Handler] would otherwise have to invent a wire format, which would make the
// SDK's apps API look different from every other endpoint the host serves.
// Instead the host passes its existing responder and the apps API is
// indistinguishable from the rest of its surface.
//
// Implementations receive the full detail — message and err — and decide what
// crosses the wire. err may be nil, and is intended for the server-side log,
// not the client: leaking it is how schema and service names escape.
type ErrorResponder interface {
	RespondError(w http.ResponseWriter, r *http.Request, message string, status int, err error)
}

// ErrorResponderFunc adapts a plain function to [ErrorResponder]. The
// signature matches the conventional Go error-responder helper, so a host can
// usually convert its existing function directly:
//
//	apps.WithErrorResponder(apps.ErrorResponderFunc(httputil.RespondError))
type ErrorResponderFunc func(w http.ResponseWriter, r *http.Request, message string, status int, err error)

// RespondError implements [ErrorResponder].
func (f ErrorResponderFunc) RespondError(w http.ResponseWriter, r *http.Request, message string, status int, err error) {
	f(w, r, message, status, err)
}

// JSONErrorResponder is the SDK's built-in [ErrorResponder]: a stdlib-only
// default so the apps API works with no host wiring at all.
//
// It logs the full error server-side and sends the client only a generic
// message plus a machine-readable code, in the envelope:
//
//	{"error":{"code":"NOT_FOUND","message":"Not Found"},"meta":{"request_id":"…"}}
//
// The zero value is usable and logs to [log/slog.Default].
type JSONErrorResponder struct {
	// Logger receives the full server-side error. nil means
	// [log/slog.Default].
	Logger *slog.Logger
}

// RespondError implements [ErrorResponder].
func (j JSONErrorResponder) RespondError(w http.ResponseWriter, r *http.Request, message string, status int, err error) {
	// The request ID is read from the response first: middleware that mints
	// one sets it there before the handler runs. Falling back to the request
	// header covers a proxy-supplied ID.
	reqID := w.Header().Get("X-Request-ID")
	if reqID == "" && r != nil {
		reqID = r.Header.Get("X-Request-ID")
	}
	logger := j.Logger
	if logger == nil {
		logger = slog.Default()
	}
	attrs := []any{"error", err, "status", status, "request_id", reqID}
	if r != nil {
		attrs = append(attrs, "method", r.Method, "path", r.URL.Path)
	}
	logger.Error(message, attrs...)

	writeJSON(w, status, errorEnvelope{
		Error: errorBody{Code: statusCode(status), Message: genericMessage(status)},
		Meta:  errorMeta{RequestID: reqID},
	})
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
	Meta  errorMeta `json:"meta"`
}

type errorBody struct {
	Code     string   `json:"code"`
	Message  string   `json:"message"`
	Blockers []string `json:"blockers,omitempty"`
}

type errorMeta struct {
	RequestID string `json:"request_id"`
}

// statusCode maps an HTTP status to the machine-readable code clients switch
// on. It matches the reference host's mapping so the SDK's default envelope is
// interchangeable with it.
func statusCode(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "BAD_REQUEST"
	case http.StatusUnauthorized:
		return "UNAUTHORIZED"
	case http.StatusForbidden:
		return "FORBIDDEN"
	case http.StatusNotFound:
		return "NOT_FOUND"
	case http.StatusConflict:
		return "CONFLICT"
	case http.StatusTooManyRequests:
		return "RATE_LIMITED"
	case http.StatusUnprocessableEntity:
		return "UNPROCESSABLE_ENTITY"
	default:
		if status >= 400 && status < 500 {
			return "BAD_REQUEST"
		}
		return "INTERNAL_ERROR"
	}
}

// genericMessage is what the client is told. Deliberately uninformative: the
// detail is in the server log.
func genericMessage(status int) string {
	switch status {
	case http.StatusNotFound:
		return "Not Found"
	case http.StatusForbidden:
		return "Forbidden"
	case http.StatusUnauthorized:
		return "Unauthorized"
	case http.StatusConflict:
		return "Conflict"
	case http.StatusTooManyRequests:
		return "Too Many Requests"
	case http.StatusUnprocessableEntity:
		return "Unprocessable Entity"
	default:
		if status >= 400 && status < 500 {
			return "Bad Request"
		}
		return "Internal Server Error"
	}
}

// writeJSON is the single place this package writes a response body.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
