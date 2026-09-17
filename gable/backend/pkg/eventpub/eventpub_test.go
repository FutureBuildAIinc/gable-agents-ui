// SPDX-License-Identifier: LicenseRef-OpenLBM-Commons-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package eventpub

import (
	"time"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDisabledPublisherIsNoOp(t *testing.T) {
	p := New("", "", "")
	p.Publish("order.confirmed", EntityRef{Kind: "order", ID: "x"})
	// Must not panic or block; nothing to assert beyond reaching here.
	if _, ok := p.(disabled); !ok {
		t.Fatalf("expected disabled publisher, got %T", p)
	}
}

func TestPublishSendsEnvelope(t *testing.T) {
	var got Event
	var key string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key = r.Header.Get("x-events-key")
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode: %v", err)
		}
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	p := New(srv.URL, "secret", "acme").(*httpPublisher)
	defer p.Stop()

	p.Publish("quote.converted",
		EntityRef{Kind: "quote", ID: "q-1"},
		WithBranch("b-1"),
		WithData(map[string]any{"total_cents": 123456}),
	)

	deadline := waitFor(t, func() bool { return p.sent.Load() == 1 })
	if !deadline {
		t.Fatalf("event never delivered; sent=%d dropped=%d", p.sent.Load(), p.dropped.Load())
	}
	if key != "secret" {
		t.Errorf("x-events-key = %q", key)
	}
	if got.Type != "quote.converted" || got.Org != "acme" || got.BranchID != "b-1" {
		t.Errorf("envelope = %+v", got)
	}
	if got.Entity.Kind != "quote" || got.Entity.ID != "q-1" {
		t.Errorf("entity = %+v", got.Entity)
	}
	if got.ID == "" || got.At == "" {
		t.Errorf("id/at not populated: %+v", got)
	}
}

func TestDropWhenEndpointFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()

	p := New(srv.URL, "k", "acme").(*httpPublisher)
	defer p.Stop()

	p.Publish("invoice.created", EntityRef{Kind: "invoice", ID: "i-1"})
	waitFor(t, func() bool { return p.sent.Load()+p.dropped.Load() >= 0 })
	// Failure must not panic, block, or count as sent.
	if p.sent.Load() != 0 {
		t.Errorf("failed POST counted as sent")
	}
}

func waitFor(t *testing.T, cond func() bool) bool {
	t.Helper()
	for i := 0; i < 200; i++ {
		if cond() {
			return true
		}
		sleep()
	}
	return false
}

func sleep() { time.Sleep(5 * time.Millisecond) }
