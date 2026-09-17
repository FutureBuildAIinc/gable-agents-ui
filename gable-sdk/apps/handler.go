// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"errors"
	"net/http"
)

// Machine-readable error codes the apps API returns. They are part of the
// stable wire contract — a client switches on them to decide what to render —
// and will not change without a major version.
const (
	// CodeAppDisabled is returned, with 404, by every route of a disabled app.
	// A client seeing it should refresh its catalog: the app was turned off
	// after the page loaded.
	CodeAppDisabled = "app_disabled"

	// CodeAppCore is returned, with 409, when disabling a core app.
	CodeAppCore = "app_core"

	// CodeAppDependencyConflict is returned, with 409, when the dependency
	// graph refuses a toggle. The payload carries a "blockers" array naming
	// the apps responsible.
	CodeAppDependencyConflict = "app_dependency_conflict"
)

// Handler exposes the registry over HTTP:
//
//	GET  /api/v1/apps                — the catalog with live enablement
//	POST /api/v1/apps/{key}/enable   — turn an app on
//	POST /api/v1/apps/{key}/disable  — turn an app off
//
// This is platform surface, not an app: it is how an operator administers the
// catalog, so it is never itself gated. The read route is intended for any
// authenticated caller — a client needs the catalog to build navigation — and
// the two mutating routes for administrators; [Handler.RegisterRoutes] takes
// the guard that enforces that.
//
// Toggle responses return the full refreshed catalog, so a client renders the
// result of a toggle without a second round trip.
type Handler struct {
	reg       *Registry
	responder ErrorResponder
}

// HandlerOption configures a [Handler].
type HandlerOption func(*Handler)

// WithErrorResponder renders this handler's errors through the host's own
// error envelope instead of [JSONErrorResponder]. See [ErrorResponder].
func WithErrorResponder(er ErrorResponder) HandlerOption {
	return func(h *Handler) {
		if er != nil {
			h.responder = er
		}
	}
}

// NewHandler creates the apps API handler over reg. With no options it renders
// errors with [JSONErrorResponder], so it works standalone.
func NewHandler(reg *Registry, opts ...HandlerOption) *Handler {
	h := &Handler{reg: reg, responder: JSONErrorResponder{}}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

// RegisterRoutes mounts the apps API on mux.
//
// adminGuard wraps the two mutating routes and nothing else: listing the
// catalog is a read every authenticated caller needs, while toggling changes
// what the deployment can do. Passing nil leaves the mutating routes unguarded
// — appropriate only when the mux is already behind an administrative guard.
//
// Mount this on the host's own mux, not on a gated [Router]: the apps API must
// keep answering when apps are disabled, since it is how they get re-enabled.
func (h *Handler) RegisterRoutes(mux Router, adminGuard func(http.Handler) http.Handler) {
	guard := func(fn http.HandlerFunc) http.Handler {
		if adminGuard != nil {
			return adminGuard(fn)
		}
		return fn
	}
	mux.HandleFunc("GET /api/v1/apps", h.handleList)
	mux.Handle("POST /api/v1/apps/{key}/enable", guard(h.handleEnable))
	mux.Handle("POST /api/v1/apps/{key}/disable", guard(h.handleDisable))
}

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
	list, err := h.reg.List(r.Context())
	if err != nil {
		h.responder.RespondError(w, r, "Failed to list apps", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, catalogResponse{Apps: list})
}

func (h *Handler) handleEnable(w http.ResponseWriter, r *http.Request) {
	h.toggle(w, r, true)
}

func (h *Handler) handleDisable(w http.ResponseWriter, r *http.Request) {
	h.toggle(w, r, false)
}

func (h *Handler) toggle(w http.ResponseWriter, r *http.Request, enabled bool) {
	key := r.PathValue("key")
	if key == "" {
		h.responder.RespondError(w, r, "Missing app key", http.StatusBadRequest, nil)
		return
	}
	err := h.reg.SetEnabled(r.Context(), key, enabled)
	var depErr *DependencyError
	switch {
	case err == nil:
		// fall through to the success response
	case errors.Is(err, ErrUnknownApp):
		h.responder.RespondError(w, r, err.Error(), http.StatusNotFound, err)
		return
	case errors.Is(err, ErrCoreApp):
		// Answered directly rather than through the responder: a responder
		// genericises messages to avoid leaking internals, but "this app is
		// core" is exactly what the caller needs to hear, and leaks nothing.
		writeJSON(w, http.StatusConflict, errorEnvelope{
			Error: errorBody{Code: CodeAppCore, Message: err.Error()},
		})
		return
	case errors.As(err, &depErr):
		// Likewise: the blocking keys are the whole point of the error, and a
		// client needs them to explain the refusal.
		writeJSON(w, http.StatusConflict, errorEnvelope{
			Error: errorBody{
				Code:     CodeAppDependencyConflict,
				Message:  depErr.Error(),
				Blockers: depErr.Blockers,
			},
		})
		return
	default:
		h.responder.RespondError(w, r, "Failed to toggle app", http.StatusInternalServerError, err)
		return
	}
	list, err := h.reg.List(r.Context())
	if err != nil {
		h.responder.RespondError(w, r, "App toggled, but listing failed", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, catalogResponse{Apps: list})
}

// catalogResponse is the body of a successful catalog read or toggle. It is an
// object rather than a bare array so the response can grow fields without
// breaking clients.
type catalogResponse struct {
	Apps []Status `json:"apps"`
}
