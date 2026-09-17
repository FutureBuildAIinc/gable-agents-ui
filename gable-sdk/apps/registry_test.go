// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// testManifests is the fixture the reference host's own registry tests used,
// carried over so a regression against the original behaviour still fails.
func testManifests() map[string]Manifest {
	return map[string]Manifest{
		"gl":        {Key: "gl", Name: "General Ledger", Core: true},
		"invoice":   {Key: "invoice", Name: "Invoicing", Core: true, DependsOn: []string{"gl"}},
		"millwork":  {Key: "millwork", Name: "Millwork"},
		"bankrecon": {Key: "bankrecon", Name: "Bank Reconciliation", DependsOn: []string{"gl"}},
		"matching":  {Key: "matching", Name: "PO Matching", DependsOn: []string{"bankrecon"}},
	}
}

func allEnabled() map[string]bool {
	return map[string]bool{"gl": true, "invoice": true, "millwork": true, "bankrecon": true, "matching": true}
}

func TestValidateToggle(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		// mutate adjusts the all-enabled baseline.
		mutate       func(map[string]bool)
		key          string
		enable       bool
		wantErr      error // tested with errors.Is
		wantBlockers []string
		wantOK       bool
	}{
		{
			name: "unknown key", key: "nope", wantErr: ErrUnknownApp,
		},
		{
			name: "core app refuses disable", key: "gl", wantErr: ErrCoreApp,
		},
		{
			name: "disable blocked by an enabled dependent",
			key:  "bankrecon", wantBlockers: []string{"matching"},
		},
		{
			name:   "disable allowed once the dependent is disabled",
			mutate: func(c map[string]bool) { c["matching"] = false },
			key:    "bankrecon", wantOK: true,
		},
		{
			name:   "enable blocked by a disabled dependency",
			mutate: func(c map[string]bool) { c["bankrecon"] = false },
			key:    "matching", enable: true, wantBlockers: []string{"bankrecon"},
		},
		{
			name:   "enable ignores core dependencies",
			mutate: func(c map[string]bool) { c["invoice"] = false },
			key:    "invoice", enable: true, wantOK: true,
		},
		{
			name: "enable with no dependencies",
			key:  "millwork", enable: true, wantOK: true,
		},
		{
			name:   "disable ignores dependents that are already disabled",
			mutate: func(c map[string]bool) { c["matching"] = false; c["invoice"] = false },
			key:    "bankrecon", wantOK: true,
		},
		{
			name: "enable is unaffected by a dependency with no record yet",
			mutate: func(c map[string]bool) {
				delete(c, "bankrecon") // never synced: fail open, do not block
			},
			key: "matching", enable: true, wantOK: true,
		},
		{
			name: "disable is blocked by a dependent with no record yet",
			mutate: func(c map[string]bool) {
				delete(c, "matching") // unknown enablement is treated as enabled
			},
			key: "bankrecon", wantBlockers: []string{"matching"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			current := allEnabled()
			if tc.mutate != nil {
				tc.mutate(current)
			}
			err := validateToggle(testManifests(), current, tc.key, tc.enable)

			switch {
			case tc.wantOK:
				if err != nil {
					t.Fatalf("validateToggle = %v, want nil", err)
				}
			case tc.wantErr != nil:
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("validateToggle = %v, want error wrapping %v", err, tc.wantErr)
				}
			case tc.wantBlockers != nil:
				var depErr *DependencyError
				if !errors.As(err, &depErr) {
					t.Fatalf("validateToggle = %v, want *DependencyError", err)
				}
				if got := strings.Join(depErr.Blockers, ","); got != strings.Join(tc.wantBlockers, ",") {
					t.Fatalf("blockers = %v, want %v", depErr.Blockers, tc.wantBlockers)
				}
				if depErr.Enabling != tc.enable {
					t.Errorf("Enabling = %v, want %v", depErr.Enabling, tc.enable)
				}
				if depErr.Key != tc.key {
					t.Errorf("Key = %q, want %q", depErr.Key, tc.key)
				}
			}
		})
	}
}

func TestDependencyErrorMessage(t *testing.T) {
	t.Parallel()
	enabling := (&DependencyError{Key: "matching", Enabling: true, Blockers: []string{"bankrecon", "gl"}}).Error()
	if !strings.Contains(enabling, "cannot enable \"matching\"") || !strings.Contains(enabling, "bankrecon, gl") {
		t.Errorf("enable message = %q", enabling)
	}
	disabling := (&DependencyError{Key: "bankrecon", Blockers: []string{"matching"}}).Error()
	if !strings.Contains(disabling, "cannot disable \"bankrecon\"") || !strings.Contains(disabling, "matching") {
		t.Errorf("disable message = %q", disabling)
	}
}

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

func noRoutes(Router) {}

func TestRegistryAdd(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name      string
		add       func(*Registry)
		wantPanic error
	}{
		{
			name: "app and static manifest coexist",
			add: func(r *Registry) {
				r.Add(App{Manifest: Manifest{Key: "millwork", Name: "Millwork"}, Register: noRoutes})
				r.AddStatic(Manifest{Key: "gl", Name: "General Ledger", Core: true})
			},
		},
		{
			name: "duplicate app key",
			add: func(r *Registry) {
				r.Add(App{Manifest: Manifest{Key: "gl", Name: "GL"}, Register: noRoutes})
				r.Add(App{Manifest: Manifest{Key: "gl", Name: "GL again"}, Register: noRoutes})
			},
			wantPanic: ErrDuplicateKey,
		},
		{
			name: "static manifest duplicating an app key",
			add: func(r *Registry) {
				r.Add(App{Manifest: Manifest{Key: "gl", Name: "GL"}, Register: noRoutes})
				r.AddStatic(Manifest{Key: "gl", Name: "GL"})
			},
			wantPanic: ErrDuplicateKey,
		},
		{
			name: "duplicate within one AddStatic call",
			add: func(r *Registry) {
				r.AddStatic(Manifest{Key: "gl", Name: "GL"}, Manifest{Key: "gl", Name: "GL"})
			},
			wantPanic: ErrDuplicateKey,
		},
		{
			name: "invalid manifest",
			add: func(r *Registry) {
				r.Add(App{Manifest: Manifest{Key: "Bad", Name: "Bad"}, Register: noRoutes})
			},
			wantPanic: ErrInvalidManifest,
		},
		{
			name: "invalid static manifest",
			add: func(r *Registry) {
				r.AddStatic(Manifest{Key: "ok", Name: "OK"}, Manifest{Key: "", Name: "Blank"})
			},
			wantPanic: ErrInvalidManifest,
		},
		{
			name: "app with no Register function",
			add: func(r *Registry) {
				r.Add(App{Manifest: Manifest{Key: "gl", Name: "GL"}})
			},
			wantPanic: ErrInvalidManifest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			reg := NewRegistry(WithLogger(quietLogger()))
			if tc.wantPanic != nil {
				requirePanic(t, tc.wantPanic, func() { tc.add(reg) })
				return
			}
			tc.add(reg)
		})
	}
}

// A rejected AddStatic must not leave half its manifests registered.
func TestRegistryAddStatic_AllOrNothing(t *testing.T) {
	t.Parallel()
	reg := NewRegistry(WithLogger(quietLogger()))
	requirePanic(t, ErrInvalidManifest, func() {
		reg.AddStatic(Manifest{Key: "good", Name: "Good"}, Manifest{Key: "BAD", Name: "Bad"})
	})
	if _, ok := reg.Lookup("good"); ok {
		t.Fatal("a rejected AddStatic registered part of its batch")
	}
}

func TestRegistryLookupAndManifests(t *testing.T) {
	t.Parallel()
	reg := NewRegistry(WithLogger(quietLogger()))
	reg.Add(App{Manifest: Manifest{Key: "millwork", Name: "Millwork", DependsOn: []string{"product"}}, Register: noRoutes})
	reg.AddStatic(Manifest{Key: "product", Name: "Products", Core: true})

	got, ok := reg.Lookup("millwork")
	if !ok || got.Name != "Millwork" {
		t.Fatalf("Lookup(millwork) = %+v, %v", got, ok)
	}
	if _, ok := reg.Lookup("absent"); ok {
		t.Fatal("Lookup(absent) reported found")
	}

	all := reg.Manifests()
	if len(all) != 2 || all[0].Key != "millwork" || all[1].Key != "product" {
		t.Fatalf("Manifests() = %+v, want [millwork product]", all)
	}

	// The returned manifests must be copies: mutating them must not corrupt
	// the registry's catalog.
	all[0].Name = "mutated"
	all[0].DependsOn[0] = "mutated"
	fresh, _ := reg.Lookup("millwork")
	if fresh.Name != "Millwork" || fresh.DependsOn[0] != "product" {
		t.Fatalf("Manifests() aliased registry state: %+v", fresh)
	}
}

func TestRegistryValidate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name      string
		manifests []Manifest
		wantErrs  []error
		wantMsg   string
	}{
		{
			name: "clean graph",
			manifests: []Manifest{
				{Key: "gl", Name: "GL"},
				{Key: "invoice", Name: "Invoice", DependsOn: []string{"gl"}},
				{Key: "ar", Name: "AR", DependsOn: []string{"invoice", "gl"}},
			},
		},
		{
			name: "unknown dependency",
			manifests: []Manifest{
				{Key: "invoice", Name: "Invoice", DependsOn: []string{"gl"}},
			},
			wantErrs: []error{ErrUnknownDependency},
			wantMsg:  `app "invoice" depends on "gl"`,
		},
		{
			name: "two-app cycle",
			manifests: []Manifest{
				{Key: "a", Name: "A", DependsOn: []string{"b"}},
				{Key: "b", Name: "B", DependsOn: []string{"a"}},
			},
			wantErrs: []error{ErrDependencyCycle},
			wantMsg:  "a -> b -> a",
		},
		{
			name: "three-app cycle",
			manifests: []Manifest{
				{Key: "a", Name: "A", DependsOn: []string{"b"}},
				{Key: "b", Name: "B", DependsOn: []string{"c"}},
				{Key: "c", Name: "C", DependsOn: []string{"a"}},
			},
			wantErrs: []error{ErrDependencyCycle},
			wantMsg:  "a -> b -> c -> a",
		},
		{
			name: "a diamond is not a cycle",
			manifests: []Manifest{
				{Key: "top", Name: "Top", DependsOn: []string{"left", "right"}},
				{Key: "left", Name: "Left", DependsOn: []string{"base"}},
				{Key: "right", Name: "Right", DependsOn: []string{"base"}},
				{Key: "base", Name: "Base"},
			},
		},
		{
			name: "both faults at once",
			manifests: []Manifest{
				{Key: "a", Name: "A", DependsOn: []string{"b"}},
				{Key: "b", Name: "B", DependsOn: []string{"a", "ghost"}},
			},
			wantErrs: []error{ErrDependencyCycle, ErrUnknownDependency},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			reg := NewRegistry(WithLogger(quietLogger()))
			reg.AddStatic(tc.manifests...)
			err := reg.Validate()
			if len(tc.wantErrs) == 0 {
				if err != nil {
					t.Fatalf("Validate() = %v, want nil", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("Validate() = nil, want %v", tc.wantErrs)
			}
			for _, want := range tc.wantErrs {
				if !errors.Is(err, want) {
					t.Errorf("Validate() = %v, want an error wrapping %v", err, want)
				}
			}
			if tc.wantMsg != "" && !strings.Contains(err.Error(), tc.wantMsg) {
				t.Errorf("Validate() = %q, want it to mention %q", err, tc.wantMsg)
			}
		})
	}
}

// The reference host's real catalog must satisfy Validate, or the migration
// guide is telling hosts to call something that fails on their own data.
func TestRegistryValidate_HostCatalogShape(t *testing.T) {
	t.Parallel()
	reg := NewRegistry(WithLogger(quietLogger()))
	manifests := make([]Manifest, 0, len(hostCatalogKeys))
	for _, key := range hostCatalogKeys {
		manifests = append(manifests, Manifest{Key: key, Name: key})
	}
	// The dependency edges the host declares today.
	deps := map[string][]string{
		"product":        {"vendor"},
		"pim":            {"product"},
		"quote":          {"product"},
		"order":          {"customer", "inventory", "invoice", "purchase_order"},
		"pricing":        {"customer", "product"},
		"invoice":        {"account", "gl"},
		"payment":        {"account", "invoice"},
		"account":        {"gl"},
		"ap":             {"gl"},
		"matching":       {"ap", "purchase_order"},
		"integrations":   {"edi", "inventory", "product", "vendor"},
		"pos":            {"inventory", "invoice", "payment", "product"},
		"portal":         {"customer", "invoice", "order", "product"},
		"millwork":       {"product"},
		"delivery":       {"customer", "inventory", "order", "pricing", "product"},
		"partner":        {"customer", "quote"},
		"crm":            {"customer", "order", "pricing", "product", "quote"},
		"purchase_order": nil,
	}
	for i := range manifests {
		manifests[i].DependsOn = deps[manifests[i].Key]
	}
	reg.AddStatic(manifests...)
	if err := reg.Validate(); err != nil {
		t.Fatalf("host catalog fails Validate(): %v", err)
	}
}

// -----------------------------------------------------------------------------
// Mounting and gating
// -----------------------------------------------------------------------------

// mountRegistry builds a registry with two apps over a fake store and mounts
// them, returning everything a gating test needs.
func mountRegistry(t *testing.T) (*Registry, *fakeStore, *http.ServeMux, map[string]*bool) {
	t.Helper()
	store := newFakeStore(
		Record{Manifest: Manifest{Key: "millwork", Name: "Millwork"}, Enabled: true},
		Record{Manifest: Manifest{Key: "pos", Name: "Point of Sale"}, Enabled: true},
	)
	reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(0))
	hits := map[string]*bool{"millwork": new(bool), "pos": new(bool), "posWildcard": new(bool)}

	reg.Add(App{Manifest: Manifest{Key: "millwork", Name: "Millwork"}, Register: func(r Router) {
		r.HandleFunc("GET /api/v1/millwork/options", func(http.ResponseWriter, *http.Request) {
			*hits["millwork"] = true
		})
	}})
	reg.Add(App{Manifest: Manifest{Key: "pos", Name: "Point of Sale"}, Register: func(r Router) {
		r.Handle("GET /api/v1/pos/tills/{id}", http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			*hits["pos"] = true
		}))
		r.HandleFunc("GET /api/v1/pos/", func(http.ResponseWriter, *http.Request) {
			*hits["posWildcard"] = true
		})
	}})

	mux := http.NewServeMux()
	reg.Mount(mux)
	return reg, store, mux, hits
}

func get(mux http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestMount_GatesEveryRegisteredRoute(t *testing.T) {
	t.Parallel()
	_, store, mux, hits := mountRegistry(t)

	if rec := get(mux, "/api/v1/millwork/options"); rec.Code != http.StatusOK || !*hits["millwork"] {
		t.Fatalf("enabled app: got %d hit=%v, want 200 and a handler hit", rec.Code, *hits["millwork"])
	}

	store.set("millwork", false)
	*hits["millwork"] = false
	rec := get(mux, "/api/v1/millwork/options")
	if rec.Code != http.StatusNotFound || *hits["millwork"] {
		t.Fatalf("disabled app: got %d hit=%v, want 404 and no handler hit", rec.Code, *hits["millwork"])
	}
	if !strings.Contains(rec.Body.String(), CodeAppDisabled) {
		t.Fatalf("disabled app body = %s, want the %q code", rec.Body.String(), CodeAppDisabled)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("disabled app Content-Type = %q, want application/json", ct)
	}

	// Disabling one app must not touch another.
	if rec := get(mux, "/api/v1/pos/tills/7"); rec.Code != http.StatusOK || !*hits["pos"] {
		t.Fatalf("unrelated app: got %d hit=%v, want 200 and a handler hit", rec.Code, *hits["pos"])
	}

	// And re-enabling must restore the route without a restart.
	store.set("millwork", true)
	if rec := get(mux, "/api/v1/millwork/options"); rec.Code != http.StatusOK || !*hits["millwork"] {
		t.Fatalf("re-enabled app: got %d hit=%v, want 200 and a handler hit", rec.Code, *hits["millwork"])
	}
}

// Gating must not disturb ServeMux pattern precedence: the more specific
// pattern still wins, gate or no gate.
func TestMount_PreservesServeMuxPrecedence(t *testing.T) {
	t.Parallel()
	_, store, mux, hits := mountRegistry(t)

	if rec := get(mux, "/api/v1/pos/tills/7"); rec.Code != http.StatusOK {
		t.Fatalf("specific pattern: got %d, want 200", rec.Code)
	}
	if !*hits["pos"] || *hits["posWildcard"] {
		t.Fatalf("specific=%v wildcard=%v, want the specific pattern to win", *hits["pos"], *hits["posWildcard"])
	}

	if rec := get(mux, "/api/v1/pos/anything/else"); rec.Code != http.StatusOK || !*hits["posWildcard"] {
		t.Fatalf("wildcard pattern: got %d hit=%v, want 200 and a handler hit", rec.Code, *hits["posWildcard"])
	}

	// Both patterns belong to the same app, so both gate together.
	store.set("pos", false)
	*hits["pos"], *hits["posWildcard"] = false, false
	if rec := get(mux, "/api/v1/pos/tills/7"); rec.Code != http.StatusNotFound || *hits["pos"] {
		t.Fatalf("disabled specific: got %d hit=%v, want 404", rec.Code, *hits["pos"])
	}
	if rec := get(mux, "/api/v1/pos/anything"); rec.Code != http.StatusNotFound || *hits["posWildcard"] {
		t.Fatalf("disabled wildcard: got %d hit=%v, want 404", rec.Code, *hits["posWildcard"])
	}
}

// The gated Router must preserve ServeMux path wildcards; an app reads them
// with r.PathValue.
func TestMount_PreservesPathValues(t *testing.T) {
	t.Parallel()
	reg := NewRegistry(WithLogger(quietLogger()))
	var got string
	reg.Add(App{Manifest: Manifest{Key: "pos", Name: "POS"}, Register: func(r Router) {
		r.HandleFunc("GET /api/v1/pos/tills/{id}", func(_ http.ResponseWriter, req *http.Request) {
			got = req.PathValue("id")
		})
	}})
	mux := http.NewServeMux()
	reg.Mount(mux)
	get(mux, "/api/v1/pos/tills/42")
	if got != "42" {
		t.Fatalf("PathValue(id) = %q, want 42", got)
	}
}

func TestMount_RegistersInAdditionOrder(t *testing.T) {
	t.Parallel()
	reg := NewRegistry(WithLogger(quietLogger()))
	var order []string
	for _, key := range []string{"c", "a", "b"} {
		reg.Add(App{Manifest: Manifest{Key: key, Name: key}, Register: func(Router) {
			order = append(order, key)
		}})
	}
	reg.Mount(http.NewServeMux())
	if strings.Join(order, "") != "cab" {
		t.Fatalf("mount order = %v, want registration order [c a b]", order)
	}
}

func TestGate_WrapsRoutesMountedOutsideTheRegistry(t *testing.T) {
	t.Parallel()
	store := newFakeStore(Record{Manifest: Manifest{Key: "legacy", Name: "Legacy"}, Enabled: true})
	reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(0))
	reg.AddStatic(Manifest{Key: "legacy", Name: "Legacy"})

	mux := http.NewServeMux()
	hit := false
	mux.Handle("GET /legacy", reg.Gate("legacy", http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hit = true
	})))

	if rec := get(mux, "/legacy"); rec.Code != http.StatusOK || !hit {
		t.Fatalf("enabled: got %d hit=%v, want 200", rec.Code, hit)
	}
	store.set("legacy", false)
	hit = false
	if rec := get(mux, "/legacy"); rec.Code != http.StatusNotFound || hit {
		t.Fatalf("disabled: got %d hit=%v, want 404", rec.Code, hit)
	}
}

// -----------------------------------------------------------------------------
// Enablement cache
// -----------------------------------------------------------------------------

func TestIsEnabled_FailsOpen(t *testing.T) {
	t.Parallel()
	t.Run("no store", func(t *testing.T) {
		t.Parallel()
		reg := NewRegistry(WithLogger(quietLogger()))
		if !reg.IsEnabled("anything") {
			t.Fatal("a registry with no store must fail open")
		}
	})

	t.Run("store error with a cold cache", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore()
		store.failRecords(errStore)
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(0))
		if !reg.IsEnabled("millwork") {
			t.Fatal("a failing store must fail open")
		}
	})

	t.Run("unknown key", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore(Record{Manifest: Manifest{Key: "gl", Name: "GL"}, Enabled: false})
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(0))
		if !reg.IsEnabled("never-heard-of-it") {
			t.Fatal("an unknown key must fail open")
		}
		if reg.IsEnabled("gl") {
			t.Fatal("a known disabled key must report disabled")
		}
	})
}

// A store that starts failing must not resurrect apps the operator disabled:
// the last good answer keeps being served.
func TestIsEnabled_ServesStaleStateWhenTheStoreFails(t *testing.T) {
	t.Parallel()
	store := newFakeStore(Record{Manifest: Manifest{Key: "millwork", Name: "Millwork"}, Enabled: false})
	reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(time.Hour))

	if reg.IsEnabled("millwork") {
		t.Fatal("millwork is disabled in the store; want disabled")
	}
	store.failRecords(errStore)
	reg.bustCache()
	if reg.IsEnabled("millwork") {
		t.Fatal("a store failure re-enabled a disabled app instead of serving the stale answer")
	}
}

func TestIsEnabled_CachesAndBusts(t *testing.T) {
	t.Parallel()
	store := newFakeStore(Record{Manifest: Manifest{Key: "millwork", Name: "Millwork"}, Enabled: true})
	reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(time.Hour))
	reg.AddStatic(Manifest{Key: "millwork", Name: "Millwork"})

	if !reg.IsEnabled("millwork") {
		t.Fatal("want enabled")
	}
	_, before := store.counts()

	// A change made behind the registry's back must stay invisible while the
	// cache is fresh, and the store must not be read again.
	store.set("millwork", false)
	if !reg.IsEnabled("millwork") {
		t.Fatal("fresh cache did not survive an out-of-band change")
	}
	if _, after := store.counts(); after != before {
		t.Fatalf("store reads = %d, want %d: a fresh cache must not read the store", after, before)
	}

	// A toggle through the registry busts the cache, so it is visible at once.
	if err := reg.SetEnabled(context.Background(), "millwork", false); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	if reg.IsEnabled("millwork") {
		t.Fatal("SetEnabled did not bust the enablement cache")
	}
}

func TestIsEnabled_RefreshesAfterTTL(t *testing.T) {
	t.Parallel()
	store := newFakeStore(Record{Manifest: Manifest{Key: "millwork", Name: "Millwork"}, Enabled: true})
	reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(20*time.Millisecond))

	if !reg.IsEnabled("millwork") {
		t.Fatal("want enabled")
	}
	store.set("millwork", false)
	deadline := time.Now().Add(2 * time.Second)
	for reg.IsEnabled("millwork") {
		if time.Now().After(deadline) {
			t.Fatal("the cache never expired: a toggle would need a restart to take effect")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestRegistry_ConcurrentReadsAreSafe(t *testing.T) {
	t.Parallel()
	store := newFakeStore(Record{Manifest: Manifest{Key: "millwork", Name: "Millwork"}, Enabled: true})
	reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithCacheTTL(0))
	reg.AddStatic(Manifest{Key: "millwork", Name: "Millwork"})

	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 25 {
				reg.IsEnabled("millwork")
				_, _ = reg.List(context.Background())
				reg.Manifests()
				_ = reg.Sync(context.Background())
			}
		}()
	}
	wg.Wait()
}

// -----------------------------------------------------------------------------
// Sync, List, SetEnabled
// -----------------------------------------------------------------------------

func TestSync(t *testing.T) {
	t.Parallel()
	t.Run("no store", func(t *testing.T) {
		t.Parallel()
		reg := NewRegistry(WithLogger(quietLogger()))
		if err := reg.Sync(context.Background()); !errors.Is(err, ErrNoStore) {
			t.Fatalf("Sync = %v, want ErrNoStore", err)
		}
	})

	t.Run("creates records enabled and normalises nil dependencies", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore()
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		reg.AddStatic(Manifest{Key: "gl", Name: "General Ledger", Core: true})

		if err := reg.Sync(context.Background()); err != nil {
			t.Fatalf("Sync: %v", err)
		}
		rec := store.get(t, "gl")
		if !rec.Enabled {
			t.Error("a newly synced app must be created enabled")
		}
		if rec.DependsOn == nil {
			t.Error("nil DependsOn must reach the store as an empty slice, not nil")
		}
		if !rec.Core || rec.Name != "General Ledger" {
			t.Errorf("record = %+v, want the manifest's metadata", rec)
		}
	})

	t.Run("refreshes metadata but never enablement", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore(Record{
			Manifest: Manifest{Key: "millwork", Name: "Old Name", Summary: "stale", Category: "Old"},
			Enabled:  false, // the operator turned this off
		})
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		reg.AddStatic(Manifest{Key: "millwork", Name: "Millwork", Summary: "fresh", Category: "Operations"})

		if err := reg.Sync(context.Background()); err != nil {
			t.Fatalf("Sync: %v", err)
		}
		rec := store.get(t, "millwork")
		if rec.Enabled {
			t.Error("Sync overwrote operator-owned enablement")
		}
		if rec.Name != "Millwork" || rec.Summary != "fresh" || rec.Category != "Operations" {
			t.Errorf("record = %+v, want metadata refreshed from code", rec)
		}
	})

	t.Run("leaves orphans untouched", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore(Record{Manifest: Manifest{Key: "fromanotherfork", Name: "Ghost"}, Enabled: false})
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		reg.AddStatic(Manifest{Key: "gl", Name: "GL"})

		if err := reg.Sync(context.Background()); err != nil {
			t.Fatalf("Sync: %v", err)
		}
		if rec := store.get(t, "fromanotherfork"); rec.Enabled || rec.Name != "Ghost" {
			t.Errorf("orphan = %+v, want it left exactly as it was", rec)
		}
	})

	t.Run("reports a store failure", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore()
		store.upsertErr = errStore
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		reg.AddStatic(Manifest{Key: "gl", Name: "GL"})
		if err := reg.Sync(context.Background()); !errors.Is(err, errStore) {
			t.Fatalf("Sync = %v, want it to wrap the store error", err)
		}
	})
}

func TestList(t *testing.T) {
	t.Parallel()
	t.Run("no store", func(t *testing.T) {
		t.Parallel()
		reg := NewRegistry(WithLogger(quietLogger()))
		if _, err := reg.List(context.Background()); !errors.Is(err, ErrNoStore) {
			t.Fatalf("List = %v, want ErrNoStore", err)
		}
	})

	t.Run("sorts by category then name and marks orphans", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore(
			Record{Manifest: Manifest{Key: "pos", Name: "Point of Sale", Category: "Sales"}, Enabled: true},
			Record{Manifest: Manifest{Key: "gl", Name: "General Ledger", Category: "Finance"}, Enabled: true},
			Record{Manifest: Manifest{Key: "ar", Name: "Accounts Receivable", Category: "Finance"}, Enabled: false},
			Record{Manifest: Manifest{Key: "ghost", Name: "Ghost", Category: "Sales"}, Enabled: true},
		)
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		reg.AddStatic(
			Manifest{Key: "pos", Name: "Point of Sale", Category: "Sales"},
			Manifest{Key: "gl", Name: "General Ledger", Category: "Finance"},
			Manifest{Key: "ar", Name: "Accounts Receivable", Category: "Finance"},
		)

		list, err := reg.List(context.Background())
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		var keys []string
		for _, s := range list {
			keys = append(keys, s.Key)
		}
		if strings.Join(keys, ",") != "ar,gl,ghost,pos" {
			t.Fatalf("order = %v, want [ar gl ghost pos] (category then name)", keys)
		}
		for _, s := range list {
			wantOrphan := s.Key == "ghost"
			if s.Orphaned != wantOrphan {
				t.Errorf("%s: Orphaned = %v, want %v", s.Key, s.Orphaned, wantOrphan)
			}
		}
		if list[0].Enabled {
			t.Error("ar is disabled in the store; List reported it enabled")
		}
	})

	t.Run("never returns nil dependencies", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore(Record{Manifest: Manifest{Key: "gl", Name: "GL"}, Enabled: true})
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		list, err := reg.List(context.Background())
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if list[0].DependsOn == nil {
			t.Fatal("DependsOn is nil; it must serialise as [] not null")
		}
	})

	t.Run("empty catalog is an empty slice, not nil", func(t *testing.T) {
		t.Parallel()
		reg := NewRegistry(WithStore(newFakeStore()), WithLogger(quietLogger()))
		list, err := reg.List(context.Background())
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if list == nil {
			t.Fatal("List returned nil; an empty catalog must serialise as []")
		}
	})

	t.Run("self-heals an empty store", func(t *testing.T) {
		t.Parallel()
		// The fresh-deployment race: the store came up empty after the
		// manifests were registered, so the first List must re-sync.
		store := newFakeStore()
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		reg.AddStatic(Manifest{Key: "gl", Name: "General Ledger"})

		list, err := reg.List(context.Background())
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(list) != 1 || list[0].Key != "gl" {
			t.Fatalf("List = %+v, want the catalog to have self-healed", list)
		}
		if upserts, _ := store.counts(); upserts != 1 {
			t.Fatalf("upsert calls = %d, want exactly 1 self-heal sync", upserts)
		}
	})

	t.Run("does not self-heal when there is nothing to write", func(t *testing.T) {
		t.Parallel()
		store := newFakeStore()
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		if _, err := reg.List(context.Background()); err != nil {
			t.Fatalf("List: %v", err)
		}
		if upserts, _ := store.counts(); upserts != 0 {
			t.Fatalf("upsert calls = %d, want 0: a registry with no manifests has nothing to heal", upserts)
		}
	})
}

func TestSetEnabled(t *testing.T) {
	t.Parallel()

	newFixture := func() (*Registry, *fakeStore, *fakeAudit) {
		store := newFakeStore(
			Record{Manifest: Manifest{Key: "gl", Name: "GL", Core: true}, Enabled: true},
			Record{Manifest: Manifest{Key: "bankrecon", Name: "Bank Rec", DependsOn: []string{"gl"}}, Enabled: true},
			Record{Manifest: Manifest{Key: "matching", Name: "Matching", DependsOn: []string{"bankrecon"}}, Enabled: true},
		)
		audit := &fakeAudit{}
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()), WithAuditSink(audit))
		reg.AddStatic(
			Manifest{Key: "gl", Name: "GL", Core: true},
			Manifest{Key: "bankrecon", Name: "Bank Rec", DependsOn: []string{"gl"}},
			Manifest{Key: "matching", Name: "Matching", DependsOn: []string{"bankrecon"}},
		)
		return reg, store, audit
	}

	t.Run("writes through and audits", func(t *testing.T) {
		t.Parallel()
		reg, store, audit := newFixture()
		if err := reg.SetEnabled(context.Background(), "matching", false); err != nil {
			t.Fatalf("SetEnabled: %v", err)
		}
		if store.get(t, "matching").Enabled {
			t.Error("the store was not updated")
		}
		events := audit.all()
		if len(events) != 1 {
			t.Fatalf("audit events = %d, want 1", len(events))
		}
		if events[0] != (ToggleEvent{Action: ActionDisable, Key: "matching", Enabled: false}) {
			t.Errorf("event = %+v, want a disable event for matching", events[0])
		}

		if err := reg.SetEnabled(context.Background(), "matching", true); err != nil {
			t.Fatalf("re-enable: %v", err)
		}
		if events := audit.all(); len(events) != 2 || events[1].Action != ActionEnable {
			t.Errorf("events = %+v, want a second event with the enable action", events)
		}
	})

	t.Run("validates against the store, not the cache", func(t *testing.T) {
		t.Parallel()
		reg, store, _ := newFixture()
		// Warm the cache while everything is on, then disable the dependent
		// out of band. A validation that trusted the cache would still refuse.
		reg.IsEnabled("bankrecon")
		store.set("matching", false)
		if err := reg.SetEnabled(context.Background(), "bankrecon", false); err != nil {
			t.Fatalf("SetEnabled = %v, want nil: validation must re-read the store", err)
		}
	})

	t.Run("refuses a core app", func(t *testing.T) {
		t.Parallel()
		reg, store, audit := newFixture()
		err := reg.SetEnabled(context.Background(), "gl", false)
		if !errors.Is(err, ErrCoreApp) {
			t.Fatalf("SetEnabled = %v, want ErrCoreApp", err)
		}
		if !store.get(t, "gl").Enabled {
			t.Error("a refused toggle still wrote to the store")
		}
		if len(audit.all()) != 0 {
			t.Error("a refused toggle was audited")
		}
	})

	t.Run("refuses an unknown key", func(t *testing.T) {
		t.Parallel()
		reg, _, _ := newFixture()
		if err := reg.SetEnabled(context.Background(), "ghost", false); !errors.Is(err, ErrUnknownApp) {
			t.Fatalf("SetEnabled = %v, want ErrUnknownApp", err)
		}
	})

	t.Run("reports a registered app with no record", func(t *testing.T) {
		t.Parallel()
		// Registered in code but never synced: the store has no row to write.
		store := newFakeStore()
		reg := NewRegistry(WithStore(store), WithLogger(quietLogger()))
		reg.AddStatic(Manifest{Key: "millwork", Name: "Millwork"})
		err := reg.SetEnabled(context.Background(), "millwork", false)
		if !errors.Is(err, ErrUnknownApp) {
			t.Fatalf("SetEnabled = %v, want ErrUnknownApp", err)
		}
		if !strings.Contains(err.Error(), "no record") {
			t.Errorf("error = %q, want it to explain that the app was never synced", err)
		}
	})

	t.Run("refuses a dependency conflict", func(t *testing.T) {
		t.Parallel()
		reg, _, _ := newFixture()
		err := reg.SetEnabled(context.Background(), "bankrecon", false)
		var depErr *DependencyError
		if !errors.As(err, &depErr) {
			t.Fatalf("SetEnabled = %v, want *DependencyError", err)
		}
		if strings.Join(depErr.Blockers, ",") != "matching" {
			t.Fatalf("blockers = %v, want [matching]", depErr.Blockers)
		}
	})

	t.Run("no store", func(t *testing.T) {
		t.Parallel()
		reg := NewRegistry(WithLogger(quietLogger()))
		reg.AddStatic(Manifest{Key: "gl", Name: "GL"})
		if err := reg.SetEnabled(context.Background(), "gl", false); !errors.Is(err, ErrNoStore) {
			t.Fatalf("SetEnabled = %v, want ErrNoStore", err)
		}
	})

	t.Run("reports a store write failure", func(t *testing.T) {
		t.Parallel()
		reg, store, audit := newFixture()
		store.setEnabledErr = errStore
		if err := reg.SetEnabled(context.Background(), "matching", false); !errors.Is(err, errStore) {
			t.Fatalf("SetEnabled = %v, want it to wrap the store error", err)
		}
		if len(audit.all()) != 0 {
			t.Error("a failed write was audited as if it had succeeded")
		}
	})
}
