// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
)

// These tests are the proof that the seam works standalone: a host and an app
// that share nothing but the SDK, exercised over real HTTP round trips through
// httptest. If the SDK ever needed something from a host beyond its three
// ports, this file would stop compiling.

// newTestHost builds the demo host with logging discarded.
func newTestHost(t *testing.T) *host {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h, err := newHost(context.Background(), logger)
	if err != nil {
		t.Fatalf("newHost: %v", err)
	}
	return h
}

// do issues one request against the host's mux and returns the recorder.
func (h *host) do(t *testing.T, method, target string, body io.Reader, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, body)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.mux.ServeHTTP(rec, req)
	return rec
}

var adminHeaders = map[string]string{"X-Demo-Role": "admin"}

// decode unmarshals a recorder's body, failing the test on malformed JSON.
func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decoding %q: %v", rec.Body.String(), err)
	}
	return out
}

type catalogBody struct {
	Apps []struct {
		Key      string   `json:"key"`
		Name     string   `json:"name"`
		Summary  string   `json:"summary"`
		Category string   `json:"category"`
		Core     bool     `json:"core"`
		Enabled  bool     `json:"enabled"`
		Orphaned bool     `json:"orphaned"`
		Depends  []string `json:"depends_on"`
	} `json:"apps"`
}

type errorBody struct {
	Error struct {
		Code     string   `json:"code"`
		Message  string   `json:"message"`
		Blockers []string `json:"blockers"`
	} `json:"error"`
}

// hostErrorBody is the envelope this host's own ErrorResponder renders, which
// is deliberately nothing like the SDK's default.
type hostErrorBody struct {
	OK     bool   `json:"ok"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
}

// TestRegistration proves the app reached the catalog with its manifest
// intact, and that the Store was written by Sync.
func TestRegistration(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	m, ok := h.registry.Lookup("hello")
	if !ok {
		t.Fatal("registry has no manifest for \"hello\"")
	}
	if m.Name != "Hello" || m.Category != "Examples" {
		t.Errorf("manifest = %+v, want Name=Hello Category=Examples", m)
	}
	if m.Core {
		t.Error("the example app must not be core: the disable path is the point")
	}
	if got := len(h.registry.Manifests()); got != 1 {
		t.Errorf("registry holds %d manifests, want 1", got)
	}
	if got := h.store.Len(); got != 1 {
		t.Errorf("store holds %d records after Sync, want 1", got)
	}
}

// TestGreetRoundTrip is the end-to-end request: an app route, mounted through
// the registry's gate, answering with the app's own body.
func TestGreetRoundTrip(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	rec := h.do(t, http.MethodGet, "/api/v1/hello/ada", nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if got := decode[greetResponse](t, rec).Message; got != "Hello, ada!" {
		t.Errorf("message = %q, want %q", got, "Hello, ada!")
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

// TestRoutingUsesPathValues proves the gate preserves ServeMux wildcards: the
// registry wraps handlers, and a wrapper that re-dispatched would lose them.
func TestRoutingUsesPathValues(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	for _, name := range []string{"ada", "grace", "hopper-2"} {
		rec := h.do(t, http.MethodGet, "/api/v1/hello/"+name, nil, nil)
		if want := "Hello, " + name + "!"; decode[greetResponse](t, rec).Message != want {
			t.Errorf("GET /api/v1/hello/%s = %q, want %q", name, rec.Body.String(), want)
		}
	}
}

// TestHandleAndHandleFuncBothWork exercises the second Router method: the PUT
// route was registered with Handle, the GET route with HandleFunc.
func TestHandleAndHandleFuncBothWork(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	body := bytes.NewBufferString(`{"greeting":"Howdy"}`)
	rec := h.do(t, http.MethodPut, "/api/v1/hello/greeting", body, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	rec = h.do(t, http.MethodGet, "/api/v1/hello/ada", nil, nil)
	if got := decode[greetResponse](t, rec).Message; got != "Howdy, ada!" {
		t.Errorf("message after PUT = %q, want %q", got, "Howdy, ada!")
	}
}

// TestCatalogEndpoint checks the read side of the apps API, which any
// authenticated caller may use.
func TestCatalogEndpoint(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	rec := h.do(t, http.MethodGet, "/api/v1/apps", nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	cat := decode[catalogBody](t, rec)
	if len(cat.Apps) != 1 {
		t.Fatalf("catalog has %d apps, want 1: %s", len(cat.Apps), rec.Body.String())
	}
	app := cat.Apps[0]
	if app.Key != "hello" || app.Name != "Hello" || !app.Enabled || app.Orphaned {
		t.Errorf("catalog entry = %+v, want key=hello name=Hello enabled=true orphaned=false", app)
	}
	if app.Depends == nil {
		t.Error("depends_on serialized as null; the SDK normalises it to []")
	}
}

// TestDisableGatesEveryAppRoute is the enablement contract end to end: toggle
// through the API, watch the app's routes go dark, toggle back.
func TestDisableGatesEveryAppRoute(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	rec := h.do(t, http.MethodPost, "/api/v1/apps/hello/disable", nil, adminHeaders)
	if rec.Code != http.StatusOK {
		t.Fatalf("disable status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if cat := decode[catalogBody](t, rec); cat.Apps[0].Enabled {
		t.Error("the toggle response still reports the app enabled")
	}

	// Both routes, registered by different Router methods, must be gated.
	for _, tc := range []struct{ method, target string }{
		{http.MethodGet, "/api/v1/hello/ada"},
		{http.MethodPut, "/api/v1/hello/greeting"},
	} {
		rec := h.do(t, tc.method, tc.target, bytes.NewBufferString(`{"greeting":"x"}`), nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s %s while disabled: status = %d, want 404", tc.method, tc.target, rec.Code)
		}
		if got := decode[errorBody](t, rec).Error.Code; got != apps.CodeAppDisabled {
			t.Errorf("%s %s while disabled: code = %q, want %q", tc.method, tc.target, got, apps.CodeAppDisabled)
		}
	}

	// The apps API itself is not gated — it is how the app gets turned back on.
	if rec := h.do(t, http.MethodGet, "/api/v1/apps", nil, nil); rec.Code != http.StatusOK {
		t.Fatalf("catalog while disabled: status = %d, want 200", rec.Code)
	}

	rec = h.do(t, http.MethodPost, "/api/v1/apps/hello/enable", nil, adminHeaders)
	if rec.Code != http.StatusOK {
		t.Fatalf("enable status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if rec := h.do(t, http.MethodGet, "/api/v1/hello/ada", nil, nil); rec.Code != http.StatusOK {
		t.Fatalf("after re-enable: status = %d, want 200", rec.Code)
	}
}

// TestToggleRequiresTheAdminGuard proves RegisterRoutes wraps the mutating
// routes, and only those, in the guard the host supplied.
func TestToggleRequiresTheAdminGuard(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	rec := h.do(t, http.MethodPost, "/api/v1/apps/hello/disable", nil, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("unguarded disable: status = %d, want 403", rec.Code)
	}
	if rec := h.do(t, http.MethodGet, "/api/v1/hello/ada", nil, nil); rec.Code != http.StatusOK {
		t.Error("a refused toggle changed enablement")
	}
}

// TestAuditSinkReceivesEveryToggle proves the AuditSink port is called, once
// per committed change, with the SDK's stable action strings.
func TestAuditSinkReceivesEveryToggle(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	h.do(t, http.MethodPost, "/api/v1/apps/hello/disable", nil, adminHeaders)
	h.do(t, http.MethodPost, "/api/v1/apps/hello/enable", nil, adminHeaders)
	h.do(t, http.MethodPost, "/api/v1/apps/hello/disable", nil, nil) // refused: no admin

	got := h.audit.entries()
	want := []apps.ToggleEvent{
		{Action: apps.ActionDisable, Key: "hello", Enabled: false},
		{Action: apps.ActionEnable, Key: "hello", Enabled: true},
	}
	if len(got) != len(want) {
		t.Fatalf("audit recorded %d events, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("audit[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// TestErrorResponderPortIsUsed proves the host's own envelope reaches the
// client instead of the SDK's default one.
func TestErrorResponderPortIsUsed(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	rec := h.do(t, http.MethodPost, "/api/v1/apps/nosuchapp/enable", nil, adminHeaders)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %q)", rec.Code, rec.Body.String())
	}
	body := decode[hostErrorBody](t, rec)
	if body.OK || body.Status != http.StatusNotFound || body.Detail == "" {
		t.Errorf("host envelope = %+v, want ok=false status=404 with a detail", body)
	}
}

// TestEnablementSurvivesResync is the invariant an operator depends on: a
// redeploy re-runs Sync, and Sync must not undo their setting.
func TestEnablementSurvivesResync(t *testing.T) {
	t.Parallel()
	h := newTestHost(t)

	h.do(t, http.MethodPost, "/api/v1/apps/hello/disable", nil, adminHeaders)
	if err := h.registry.Sync(context.Background()); err != nil {
		t.Fatalf("re-sync: %v", err)
	}
	rec := h.do(t, http.MethodGet, "/api/v1/apps", nil, nil)
	if cat := decode[catalogBody](t, rec); cat.Apps[0].Enabled {
		t.Error("Sync re-enabled an app the operator had disabled")
	}
}
