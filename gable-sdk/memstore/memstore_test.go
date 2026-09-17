// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package memstore_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
	"github.com/FutureBuildAIinc/gable-sdk/memstore"
)

// These tests are the executable statement of the apps.Store contract. They
// live in memstore_test (the external test package) deliberately: memstore's
// value is that it is a *conforming* Store, and a test that can only reach the
// exported surface is the same test a host could run against its own
// implementation.

func manifest(key string, deps ...string) apps.Manifest {
	return apps.Manifest{Key: key, Name: key, Category: "Test", DependsOn: deps}
}

// sameManifest compares two manifests. apps.Manifest holds a slice, so it is
// not comparable with ==.
func sameManifest(a, b apps.Manifest) bool {
	return a.Key == b.Key && a.Name == b.Name && a.Summary == b.Summary &&
		a.Category == b.Category && a.Core == b.Core && slices.Equal(a.DependsOn, b.DependsOn)
}

// quietLogger keeps the registry's expected startup chatter out of test output.
func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// keys extracts the record keys, in the order returned.
func keys(records []apps.Record) []string {
	out := make([]string, len(records))
	for i, rec := range records {
		out[i] = rec.Key
	}
	return out
}

// records reads the store, failing the test on error.
func records(t *testing.T, s *memstore.Store) []apps.Record {
	t.Helper()
	recs, err := s.Records(context.Background())
	if err != nil {
		t.Fatalf("Records: %v", err)
	}
	return recs
}

// find returns the record with the given key.
func find(t *testing.T, s *memstore.Store, key string) apps.Record {
	t.Helper()
	for _, rec := range records(t, s) {
		if rec.Key == key {
			return rec
		}
	}
	t.Fatalf("no record %q in store", key)
	return apps.Record{}
}

func TestNew_Empty(t *testing.T) {
	t.Parallel()
	s := memstore.New()
	if got := s.Len(); got != 0 {
		t.Errorf("Len = %d, want 0", got)
	}
	recs := records(t, s)
	if len(recs) != 0 {
		t.Errorf("Records = %v, want empty", recs)
	}
	if recs == nil {
		t.Error("Records returned nil; an empty store must return an empty slice")
	}
}

// TestNew_SeedsIncludingDisabled is how a test starts from a deployment that
// already has an app turned off.
func TestNew_SeedsIncludingDisabled(t *testing.T) {
	t.Parallel()
	s := memstore.New(
		apps.Record{Manifest: manifest("gl"), Enabled: true},
		apps.Record{Manifest: manifest("millwork"), Enabled: false},
	)
	if got := s.Len(); got != 2 {
		t.Fatalf("Len = %d, want 2", got)
	}
	if got := find(t, s, "millwork").Enabled; got {
		t.Error("seeded disabled record came back enabled")
	}
	if got := find(t, s, "gl").Enabled; !got {
		t.Error("seeded enabled record came back disabled")
	}
}

// TestNew_CopiesSeedDependsOn proves the store does not alias a caller's slice.
func TestNew_CopiesSeedDependsOn(t *testing.T) {
	t.Parallel()
	deps := []string{"gl"}
	s := memstore.New(apps.Record{Manifest: manifest("invoice", deps...), Enabled: true})
	deps[0] = "mutated"
	if got := find(t, s, "invoice").DependsOn; !slices.Equal(got, []string{"gl"}) {
		t.Errorf("DependsOn = %v, want [gl]: the store aliased the caller's slice", got)
	}
}

// TestUpsert_CreatesEnabled is the contract for a brand-new app: it arrives on.
func TestUpsert_CreatesEnabled(t *testing.T) {
	t.Parallel()
	s := memstore.New()
	if err := s.Upsert(context.Background(), []apps.Manifest{manifest("gl"), manifest("invoice", "gl")}); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if got := s.Len(); got != 2 {
		t.Fatalf("Len = %d, want 2", got)
	}
	for _, rec := range records(t, s) {
		if !rec.Enabled {
			t.Errorf("new record %q created disabled, want enabled", rec.Key)
		}
	}
}

// TestUpsert_RefreshesManifestButNotEnablement is the invariant the whole
// design turns on: metadata comes from code, enablement belongs to the
// operator, and a redeploy must never overwrite the latter.
func TestUpsert_RefreshesManifestButNotEnablement(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := memstore.New(apps.Record{
		Manifest: apps.Manifest{Key: "millwork", Name: "Old Name", Summary: "old", Category: "Sales"},
		Enabled:  false,
	})

	updated := apps.Manifest{
		Key: "millwork", Name: "Millwork", Summary: "new", Category: "Operations",
		Core: true, DependsOn: []string{"product"},
	}
	if err := s.Upsert(ctx, []apps.Manifest{updated}); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	rec := find(t, s, "millwork")
	if rec.Enabled {
		t.Error("Upsert re-enabled an app the operator had disabled")
	}
	if !sameManifest(rec.Manifest, updated) {
		t.Errorf("manifest = %+v, want it refreshed to %+v", rec.Manifest, updated)
	}
}

// TestUpsert_NeverDeletes keeps records this build does not recognise — the
// orphan case the registry reports rather than destroys.
func TestUpsert_NeverDeletes(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := memstore.New(apps.Record{Manifest: manifest("from_another_branch"), Enabled: false})

	if err := s.Upsert(ctx, []apps.Manifest{manifest("gl")}); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if got := keys(records(t, s)); !slices.Equal(got, []string{"from_another_branch", "gl"}) {
		t.Errorf("keys = %v, want the orphan preserved alongside the new record", got)
	}
	if find(t, s, "from_another_branch").Enabled {
		t.Error("Upsert changed an orphan's enablement")
	}
}

func TestUpsert_EmptyAndNilAreNoOps(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := memstore.New(apps.Record{Manifest: manifest("gl"), Enabled: true})
	if err := s.Upsert(ctx, nil); err != nil {
		t.Fatalf("Upsert(nil): %v", err)
	}
	if err := s.Upsert(ctx, []apps.Manifest{}); err != nil {
		t.Fatalf("Upsert(empty): %v", err)
	}
	if got := s.Len(); got != 1 {
		t.Errorf("Len = %d, want 1", got)
	}
}

// TestUpsert_CopiesDependsOn proves the store does not retain the caller's
// backing array, which a registry that reuses a manifest slice would corrupt.
func TestUpsert_CopiesDependsOn(t *testing.T) {
	t.Parallel()
	deps := []string{"gl"}
	s := memstore.New()
	if err := s.Upsert(context.Background(), []apps.Manifest{manifest("invoice", deps...)}); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	deps[0] = "mutated"
	if got := find(t, s, "invoice").DependsOn; !slices.Equal(got, []string{"gl"}) {
		t.Errorf("DependsOn = %v, want [gl]", got)
	}
}

func TestRecords_SortedByKey(t *testing.T) {
	t.Parallel()
	s := memstore.New()
	if err := s.Upsert(context.Background(), []apps.Manifest{
		manifest("millwork"), manifest("ap"), manifest("gl"), manifest("bankrecon"),
	}); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	want := []string{"ap", "bankrecon", "gl", "millwork"}
	if got := keys(records(t, s)); !slices.Equal(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
}

// TestRecords_ReturnsCopies proves a caller cannot reach into the store by
// mutating what it was handed.
func TestRecords_ReturnsCopies(t *testing.T) {
	t.Parallel()
	s := memstore.New(apps.Record{Manifest: manifest("invoice", "gl"), Enabled: true})

	got := records(t, s)
	got[0].Enabled = false
	got[0].Name = "clobbered"
	got[0].DependsOn[0] = "clobbered"

	rec := find(t, s, "invoice")
	if !rec.Enabled || rec.Name != "invoice" || !slices.Equal(rec.DependsOn, []string{"gl"}) {
		t.Errorf("record = %+v, want unchanged: Records handed out aliases", rec)
	}
}

func TestSetEnabled(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := memstore.New(apps.Record{Manifest: manifest("millwork"), Enabled: true})

	found, err := s.SetEnabled(ctx, "millwork", false)
	if err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	if !found {
		t.Fatal("found = false for an existing record")
	}
	if find(t, s, "millwork").Enabled {
		t.Error("record still enabled after SetEnabled(false)")
	}

	if _, err := s.SetEnabled(ctx, "millwork", true); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	if !find(t, s, "millwork").Enabled {
		t.Error("record still disabled after SetEnabled(true)")
	}
}

// TestSetEnabled_UnknownKeyCreatesNothing is what makes the registry able to
// report ErrUnknownApp instead of inventing an app.
func TestSetEnabled_UnknownKeyCreatesNothing(t *testing.T) {
	t.Parallel()
	s := memstore.New()

	found, err := s.SetEnabled(context.Background(), "nope", true)
	if err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	if found {
		t.Error("found = true for a key with no record")
	}
	if got := s.Len(); got != 0 {
		t.Errorf("Len = %d, want 0: SetEnabled created a record", got)
	}
}

// TestSetEnabled_LeavesTheManifestAlone: enablement is the only column the
// Store contract lets the SDK change.
func TestSetEnabled_LeavesTheManifestAlone(t *testing.T) {
	t.Parallel()
	seed := apps.Record{
		Manifest: apps.Manifest{Key: "gl", Name: "General Ledger", Summary: "s", Category: "Finance", Core: true},
		Enabled:  true,
	}
	s := memstore.New(seed)
	if _, err := s.SetEnabled(context.Background(), "gl", false); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	if got := find(t, s, "gl"); !sameManifest(got.Manifest, seed.Manifest) {
		t.Errorf("manifest = %+v, want %+v", got.Manifest, seed.Manifest)
	}
}

// TestConcurrentUse runs every method at once. Its value is under -race.
func TestConcurrentUse(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := memstore.New()
	if err := s.Upsert(ctx, []apps.Manifest{manifest("gl"), manifest("invoice", "gl")}); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	const workers = 8
	var wg sync.WaitGroup
	wg.Add(workers * 4)
	for i := range workers {
		go func() { defer wg.Done(); _, _ = s.Records(ctx) }()
		go func() { defer wg.Done(); _ = s.Len() }()
		go func() { defer wg.Done(); _, _ = s.SetEnabled(ctx, "invoice", i%2 == 0) }()
		go func() { defer wg.Done(); _ = s.Upsert(ctx, []apps.Manifest{manifest("gl"), manifest("millwork")}) }()
	}
	wg.Wait()

	if got := s.Len(); got != 3 {
		t.Errorf("Len = %d, want 3", got)
	}
}

// TestDrivesTheRealRegistry is the point of the package: the whole SDK — sync,
// gating, the dependency graph, the HTTP API — running against nothing but a
// map. If this passes, an app author needs no database to develop.
func TestDrivesTheRealRegistry(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := memstore.New()
	reg := apps.NewRegistry(apps.WithStore(store), apps.WithLogger(quietLogger()))

	reg.Add(apps.App{
		Manifest: apps.Manifest{Key: "gl", Name: "General Ledger", Core: true},
		Register: func(r apps.Router) {
			r.HandleFunc("GET /gl", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("gl")) })
		},
	})
	reg.Add(apps.App{
		Manifest: apps.Manifest{Key: "bankrecon", Name: "Bank Reconciliation", DependsOn: []string{"gl"}},
		Register: func(r apps.Router) {
			r.HandleFunc("GET /bankrecon", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("bankrecon")) })
		},
	})
	if err := reg.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	mux := http.NewServeMux()
	reg.Mount(mux)
	if err := reg.Sync(ctx); err != nil {
		t.Fatalf("Sync: %v", err)
	}
	if got := store.Len(); got != 2 {
		t.Fatalf("store holds %d records after Sync, want 2", got)
	}

	get := func(path string) int {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec.Code
	}
	if code := get("/bankrecon"); code != http.StatusOK {
		t.Fatalf("GET /bankrecon = %d, want 200", code)
	}

	if err := reg.SetEnabled(ctx, "bankrecon", false); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	if code := get("/bankrecon"); code != http.StatusNotFound {
		t.Errorf("GET /bankrecon while disabled = %d, want 404", code)
	}
	if code := get("/gl"); code != http.StatusOK {
		t.Errorf("GET /gl = %d, want 200: disabling one app gated another", code)
	}

	// Core protection reaches through the store unchanged.
	if err := reg.SetEnabled(ctx, "gl", false); err == nil {
		t.Error("SetEnabled disabled a core app")
	}

	list, err := reg.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("List returned %d entries, want 2", len(list))
	}
	for _, st := range list {
		if st.Orphaned {
			t.Errorf("%q reported as orphaned", st.Key)
		}
	}
}
