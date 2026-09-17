// SPDX-License-Identifier: LicenseRef-OpenLBM-Commons-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

// Package eventpub publishes domain events from gable to the platform event
// backbone (Appwrite events-ingest function — see gable-agents-ui ADR 0001).
//
// # Semantics
//
// Publishing is fire-and-forget and at-most-once: a bounded in-memory queue,
// one drainer goroutine, no persistence. Publish never blocks and never
// returns an error to the caller — ERP transactions must not fail or slow
// down because the event backbone is slow or down. When the queue is full the
// event is dropped and counted; consumers that cannot tolerate drops must
// fall back to polling REST (the same recovery posture as pkg/eventbus).
//
// # Envelope
//
// Events use `<entity>.<verb>` past-tense types and a stable JSON envelope
// (id/type/org/branchId/entity/data/at) documented in ADR 0001 of the
// gable-agents-ui repo. The `data` payload is a small summary — never the
// full entity, never PII beyond what the UI needs for a refresh decision.
//
// # Configuration
//
// Disabled (all no-ops) unless APPWRITE_EVENTS_URL and APPWRITE_EVENTS_KEY
// are set. APPWRITE_ORG identifies this gable instance's org slug in the
// envelope.
package eventpub

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// EntityRef names the thing an event is about.
type EntityRef struct {
	Kind string `json:"kind"` // e.g. "order", "quote", "invoice"
	ID   string `json:"id"`   // UUID
}

// Event is the wire envelope (ADR 0001).
type Event struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"` // <entity>.<verb>, e.g. "order.confirmed"
	Org      string       `json:"org"`
	BranchID string       `json:"branchId,omitempty"`
	Entity   EntityRef    `json:"entity"`
	Data     any          `json:"data,omitempty"`
	At       string       `json:"at"` // RFC3339
}

// Publisher is the seam producers depend on. The zero value is a disabled
// no-op, so wiring never needs a nil check.
type Publisher interface {
	Publish(eventType string, entity EntityRef, opts ...PublishOption)
}

type publishConfig struct {
	branchID string
	data     any
}

// PublishOption tunes a single Publish call.
type PublishOption func(*publishConfig)

// WithBranch attaches the acting branch (X-Branch-Id value) to the event.
func WithBranch(branchID string) PublishOption {
	return func(c *publishConfig) { c.branchID = branchID }
}

// WithData attaches a small summary payload.
func WithData(data any) PublishOption {
	return func(c *publishConfig) { c.data = data }
}

// disabled is the no-op Publisher used when the backbone is not configured.
type disabled struct{}

func (disabled) Publish(string, EntityRef, ...PublishOption) {}

type httpPublisher struct {
	url     string
	key     string
	org     string
	client  *http.Client
	queue   chan Event
	wg      sync.WaitGroup
	stopped atomic.Bool

	dropped atomic.Int64
	sent    atomic.Int64
}

// New returns a Publisher for the platform event backbone. When url or key is
// empty it returns the no-op Publisher — event publishing is opt-in per
// deployment via APPWRITE_EVENTS_URL / APPWRITE_EVENTS_KEY.
func New(url, key, org string) Publisher {
	if url == "" || key == "" {
		return disabled{}
	}
	p := &httpPublisher{
		url:    url,
		key:    key,
		org:    org,
		client: &http.Client{Timeout: 5 * time.Second},
		queue:  make(chan Event, queueSize),
	}
	p.wg.Add(1)
	go p.drain()
	return p
}

const queueSize = 256

func (p *httpPublisher) Publish(eventType string, entity EntityRef, opts ...PublishOption) {
	if p.stopped.Load() {
		return
	}
	var cfg publishConfig
	for _, opt := range opts {
		opt(&cfg)
	}
	ev := Event{
		ID:       uuid.NewString(),
		Type:     eventType,
		Org:      p.org,
		BranchID: cfg.branchID,
		Entity:   entity,
		Data:     cfg.data,
		At:       time.Now().UTC().Format(time.RFC3339),
	}
	select {
	case p.queue <- ev:
	default:
		// Queue full: drop rather than stall the ERP request goroutine.
		p.dropped.Add(1)
	}
}

func (p *httpPublisher) drain() {
	defer p.wg.Done()
	for ev := range p.queue {
		p.post(ev)
	}
}

func (p *httpPublisher) post(ev Event) {
	body, err := json.Marshal(ev)
	if err != nil {
		return
	}
	req, err := http.NewRequest(http.MethodPost, p.url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-events-key", p.key)
	resp, err := p.client.Do(req)
	if err != nil {
		return // dropped by design; see package doc
	}
	defer resp.Body.Close()
	if resp.StatusCode < 300 {
		p.sent.Add(1)
	}
}

// Stop drains no further: enqueue turns into a no-op and the drainer exits
// after its in-flight POST. Provided for tests and graceful shutdown; the
// ERP never needs to call it.
func (p *httpPublisher) Stop() {
	if p.stopped.Swap(true) {
		return
	}
	close(p.queue)
	p.wg.Wait()
}

// Stats reports sent/dropped counters (wired to /metrics in a follow-up).
func (p *httpPublisher) Stats() (sent, dropped int64) {
	return p.sent.Load(), p.dropped.Load()
}

var _ = fmt.Sprintf // keep fmt for future structured logging hooks
