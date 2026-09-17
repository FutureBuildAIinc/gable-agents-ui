// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

// Package memstore provides an in-memory [apps.Store].
//
// It exists so that an app can be developed and tested against the real
// registry with no database at all: the same code paths, the same gating, the
// same dependency validation, backed by a map. It is also the shortest
// complete answer to "what does implementing apps.Store involve" — the whole
// contract is under a hundred lines.
//
// It is safe for concurrent use and it forgets everything on exit. Do not
// deploy it: enablement is operator state and must survive a restart.
package memstore

import (
	"context"
	"maps"
	"slices"
	"sync"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
)

// Store is an in-memory [apps.Store].
//
// The zero value is not usable; create one with [New].
type Store struct {
	mu      sync.RWMutex
	records map[string]apps.Record
}

// New creates an empty Store. The supplied seed records, if any, are inserted
// as-is — including their enablement — which is how a test starts from a
// deployment that already has apps turned off.
func New(seed ...apps.Record) *Store {
	s := &Store{records: make(map[string]apps.Record, len(seed))}
	for _, rec := range seed {
		rec.DependsOn = slices.Clone(rec.DependsOn)
		s.records[rec.Key] = rec
	}
	return s
}

// Upsert implements [apps.Store]: it creates missing records enabled, refreshes
// the manifest of records that exist, and never touches enablement or deletes
// anything.
func (s *Store) Upsert(_ context.Context, manifests []apps.Manifest) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, m := range manifests {
		m.DependsOn = slices.Clone(m.DependsOn)
		if existing, ok := s.records[m.Key]; ok {
			s.records[m.Key] = apps.Record{Manifest: m, Enabled: existing.Enabled}
			continue
		}
		s.records[m.Key] = apps.Record{Manifest: m, Enabled: true}
	}
	return nil
}

// Records implements [apps.Store], returning a copy sorted by key. The order is
// not part of the [apps.Store] contract — the registry sorts for itself — but
// determinism makes tests that read this store directly reproducible.
func (s *Store) Records(_ context.Context) ([]apps.Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]apps.Record, 0, len(s.records))
	for _, key := range slices.Sorted(maps.Keys(s.records)) {
		rec := s.records[key]
		rec.DependsOn = slices.Clone(rec.DependsOn)
		out = append(out, rec)
	}
	return out, nil
}

// SetEnabled implements [apps.Store]. It reports false, and changes nothing,
// when no record has that key.
func (s *Store) SetEnabled(_ context.Context, key string, enabled bool) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.records[key]
	if !ok {
		return false, nil
	}
	rec.Enabled = enabled
	s.records[key] = rec
	return true, nil
}

// Len reports how many records the store holds. It is a convenience for tests;
// it is not part of [apps.Store].
func (s *Store) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.records)
}

// compile-time proof that Store satisfies the port.
var _ apps.Store = (*Store)(nil)
