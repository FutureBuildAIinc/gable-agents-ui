// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"sync"
	"testing"
)

// The fakes here are deliberately local to the package's own tests rather than
// reused from memstore: several of them exist only to inject failures the
// shipped store cannot produce, and a unit test that shares an implementation
// with the code under test stops being independent evidence.

// fakeStore is an in-memory Store with injectable failures.
type fakeStore struct {
	mu sync.Mutex

	records map[string]Record

	upsertErr     error
	recordsErr    error
	setEnabledErr error

	upsertCalls  int
	recordsCalls int
}

func newFakeStore(seed ...Record) *fakeStore {
	s := &fakeStore{records: map[string]Record{}}
	for _, rec := range seed {
		s.records[rec.Key] = rec
	}
	return s
}

func (s *fakeStore) Upsert(_ context.Context, manifests []Manifest) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.upsertCalls++
	if s.upsertErr != nil {
		return s.upsertErr
	}
	for _, m := range manifests {
		if existing, ok := s.records[m.Key]; ok {
			s.records[m.Key] = Record{Manifest: m, Enabled: existing.Enabled}
			continue
		}
		s.records[m.Key] = Record{Manifest: m, Enabled: true}
	}
	return nil
}

func (s *fakeStore) Records(_ context.Context) ([]Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recordsCalls++
	if s.recordsErr != nil {
		return nil, s.recordsErr
	}
	out := make([]Record, 0, len(s.records))
	for _, rec := range s.records {
		out = append(out, rec)
	}
	// Shuffle-proofing: return in an order the registry must not rely on.
	slices.SortFunc(out, func(a, b Record) int {
		if a.Key > b.Key {
			return -1
		}
		if a.Key < b.Key {
			return 1
		}
		return 0
	})
	return out, nil
}

func (s *fakeStore) SetEnabled(_ context.Context, key string, enabled bool) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.setEnabledErr != nil {
		return false, s.setEnabledErr
	}
	rec, ok := s.records[key]
	if !ok {
		return false, nil
	}
	rec.Enabled = enabled
	s.records[key] = rec
	return true, nil
}

// set writes a record's enablement behind the registry's back, so a test can
// prove what the cache does and does not notice.
func (s *fakeStore) set(key string, enabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec := s.records[key]
	rec.Enabled = enabled
	s.records[key] = rec
}

func (s *fakeStore) get(t *testing.T, key string) Record {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.records[key]
	if !ok {
		t.Fatalf("store has no record %q", key)
	}
	return rec
}

func (s *fakeStore) failRecords(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recordsErr = err
}

func (s *fakeStore) counts() (upsert, records int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.upsertCalls, s.recordsCalls
}

// fakeAudit records every toggle event the registry emits.
type fakeAudit struct {
	mu     sync.Mutex
	events []ToggleEvent
}

func (a *fakeAudit) RecordToggle(_ context.Context, ev ToggleEvent) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.events = append(a.events, ev)
}

func (a *fakeAudit) all() []ToggleEvent {
	a.mu.Lock()
	defer a.mu.Unlock()
	return slices.Clone(a.events)
}

// fakeResponder captures what the handler asked its ErrorResponder to render.
type fakeResponder struct {
	mu    sync.Mutex
	calls []responderCall
}

type responderCall struct {
	message string
	status  int
	err     error
}

func (f *fakeResponder) RespondError(w http.ResponseWriter, _ *http.Request, message string, status int, err error) {
	f.mu.Lock()
	f.calls = append(f.calls, responderCall{message: message, status: status, err: err})
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, `{"host":"envelope"}`)
}

func (f *fakeResponder) all() []responderCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.calls)
}

// quietLogger keeps expected warnings out of test output while still
// exercising every logging path.
func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

var errStore = errors.New("store is on fire")

// requirePanic asserts fn panics with an error wrapping want.
func requirePanic(t *testing.T, want error, fn func()) {
	t.Helper()
	defer func() {
		rec := recover()
		if rec == nil {
			t.Fatalf("want panic wrapping %v, got none", want)
		}
		err, ok := rec.(error)
		if !ok {
			t.Fatalf("want panic value to be an error, got %T: %v", rec, rec)
		}
		if !errors.Is(err, want) {
			t.Fatalf("want panic wrapping %v, got %v", want, err)
		}
	}()
	fn()
}
