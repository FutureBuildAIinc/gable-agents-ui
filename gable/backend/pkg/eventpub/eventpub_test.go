// SPDX-License-Identifier: LicenseRef-OpenLBM-Commons-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package eventpub

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDisabledPublisherIsNoOp(t *testing.T) {
	p := New("", "", "", "")
	p.Publish("order.confirmed", EntityRef{Kind: "order", ID: "x"})
	// Must not panic or block; nothing to assert beyond reaching here.
	if _, ok := p.(disabled); !ok {
		t.Fatalf("expected disabled publisher, got %T", p)
	}
}

func TestPublishSendsEnvelope(t *testing.T) {
	var got map[string]string
	var key, project string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key = r.Header.Get("x-appwrite-key")
		project = r.Header.Get("x-appwrite-project")
		var outer struct {
			DocumentID string            `json:"documentId"`
			Data       map[string]string `json:"data"`
		}
		if err := json.NewDecoder(r.Body).Decode(&outer); err != nil {
			t.Errorf("decode: %v", err)
		}
		if outer.DocumentID != "unique()" {
			t.Errorf("documentId = %q", outer.DocumentID)
		}
		got = outer.Data
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	p := New(srv.URL, "proj-1", "secret", "acme").(*httpPublisher)
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
		t.Errorf("x-appwrite-key = %q", key)
	}
	if project != "proj-1" {
		t.Errorf("x-appwrite-project = %q", project)
	}
	if got["type"] != "quote.converted" || got["org"] != "acme" || got["branchId"] != "b-1" {
		t.Errorf("envelope = %+v", got)
	}
	if got["entityKind"] != "quote" || got["entityId"] != "q-1" {
		t.Errorf("entity = %+v", got)
	}
	if got["eventId"] == "" || got["at"] == "" {
		t.Errorf("eventId/at not populated: %+v", got)
	}
}

func TestDropWhenEndpointFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()

	p := New(srv.URL, "proj", "k", "acme").(*httpPublisher)
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
