// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"
)

// DefaultCacheTTL is how long [Registry.IsEnabled] serves enablement from
// memory before re-reading the [Store]. It bounds how long a toggle takes to
// reach every in-flight request — the operator-visible cost of not restarting
// the process to change enablement.
const DefaultCacheTTL = 30 * time.Second

// storeTimeout bounds the background reads the registry issues on its own
// initiative (cache refresh, self-heal), which have no request context to
// inherit a deadline from.
const storeTimeout = 3 * time.Second

// selfHealTimeout bounds the re-sync the registry attempts when it finds an
// empty store. It is longer than storeTimeout because it writes every
// manifest.
const selfHealTimeout = 15 * time.Second

// Status is one app as the catalog API reports it: the manifest, the live
// enablement, and whether this build recognises it at all.
//
// It marshals flat — {"key":…,"name":…,"enabled":true} — because both embedded
// structs are anonymous.
type Status struct {
	Record
	// Orphaned marks a record with no manifest in this build: another branch,
	// a fork, or a removed app left it behind. Orphans are reported so drift
	// is visible, are never modified, and cannot be toggled from this build.
	Orphaned bool `json:"orphaned,omitempty"`
}

// Registry owns the app catalog for one process: the manifests compiled into
// this build, the records persisted in the [Store], the enablement cache, and
// the per-request gate that enforces it.
//
// A Registry is safe for concurrent use. The intended lifecycle is: build it,
// [Registry.Add] every app, [Registry.Mount] onto the host's mux, then
// [Registry.Sync] — all during startup, before serving. After that it is
// read-mostly.
type Registry struct {
	store    Store
	logger   *slog.Logger
	audit    AuditSink
	cacheTTL time.Duration

	mu       sync.RWMutex
	apps     []App               // gated apps, in registration order
	static   []Manifest          // catalog-only manifests
	byKey    map[string]Manifest // every manifest this build knows
	disabled map[string]bool     // enablement cache: key -> disabled
	cachedAt time.Time
	healedAt time.Time
}

// Option configures a [Registry]. Options exist rather than constructor
// parameters so that a future release can grow a new knob without breaking
// every host that calls [NewRegistry].
type Option func(*Registry)

// WithStore supplies the persistence port.
//
// A registry without a Store is a legitimate configuration, not an error: the
// catalog still mounts and every app runs, because enablement fails open. It
// is what an app's own tests should use. The operations that genuinely need
// persistence — [Registry.Sync], [Registry.List], [Registry.SetEnabled] —
// return [ErrNoStore].
func WithStore(s Store) Option { return func(r *Registry) { r.store = s } }

// WithLogger supplies the logger for the registry's own diagnostics: sync
// results, orphan warnings, and store failures it has swallowed to stay up. It
// defaults to [log/slog.Default].
func WithLogger(l *slog.Logger) Option {
	return func(r *Registry) {
		if l != nil {
			r.logger = l
		}
	}
}

// WithAuditSink routes committed toggles to the host's governance log. See
// [AuditSink].
func WithAuditSink(a AuditSink) Option { return func(r *Registry) { r.audit = a } }

// WithCacheTTL overrides [DefaultCacheTTL].
//
// Zero or negative disables caching: every [Registry.IsEnabled] call reads the
// Store, which makes toggles instantaneous and is the right setting for tests.
// It also puts a Store read on every gated request, so it is the wrong setting
// for production.
func WithCacheTTL(d time.Duration) Option { return func(r *Registry) { r.cacheTTL = d } }

// NewRegistry creates an empty registry. All configuration is optional; the
// zero-option registry is usable and fails open on every enablement check.
func NewRegistry(opts ...Option) *Registry {
	r := &Registry{
		logger:   slog.Default(),
		cacheTTL: DefaultCacheTTL,
		byKey:    map[string]Manifest{},
		disabled: map[string]bool{},
	}
	for _, opt := range opts {
		opt(r)
	}
	return r
}

// Add registers an app: its manifest joins the catalog, and its Register
// closure will be invoked with a gated [Router] when [Registry.Mount] runs.
// Registration order is preserved, and is the order routes are mounted in.
//
// Add panics if the manifest is invalid, if Register is nil, or if the key is
// already registered. These are programmer errors in startup wiring, detected
// before the process serves anything — the same contract, and the same
// reasoning, as [net/http.ServeMux.Handle] panicking on a duplicate pattern.
// The panic value is an error wrapping [ErrInvalidManifest] or
// [ErrDuplicateKey].
func (r *Registry) Add(app App) {
	if err := app.Manifest.Validate(); err != nil {
		panic(err)
	}
	if app.Register == nil {
		panic(fmt.Errorf("%w: app %q has no Register function", ErrInvalidManifest, app.Key))
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, dup := r.byKey[app.Key]; dup {
		panic(fmt.Errorf("%w: %q", ErrDuplicateKey, app.Key))
	}
	r.byKey[app.Key] = app.Manifest
	r.apps = append(r.apps, app)
}

// AddStatic registers manifests for apps that appear in the catalog but do not
// mount routes through the registry — apps whose wiring predates the SDK, or
// that expose no HTTP surface at all. They are listed, synced, and
// dependency-checked like any other app; they are simply not gated, because
// the registry never sees their routes. Gate them individually with
// [Registry.Gate] if you want enforcement before converting them.
//
// It panics on the same conditions as [Registry.Add].
func (r *Registry) AddStatic(manifests ...Manifest) {
	for _, m := range manifests {
		if err := m.Validate(); err != nil {
			panic(err)
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, m := range manifests {
		if _, dup := r.byKey[m.Key]; dup {
			panic(fmt.Errorf("%w: %q", ErrDuplicateKey, m.Key))
		}
		r.byKey[m.Key] = m
		r.static = append(r.static, m)
	}
}

// Lookup returns the manifest registered under key.
func (r *Registry) Lookup(key string) (Manifest, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.byKey[key]
	return m, ok
}

// Manifests returns every registered manifest, sorted by key. The slice and
// its manifests are copies; mutating them does not affect the registry.
func (r *Registry) Manifests() []Manifest {
	r.mu.RLock()
	out := slices.Collect(maps.Values(r.byKey))
	r.mu.RUnlock()
	slices.SortFunc(out, func(a, b Manifest) int { return cmp.Compare(a.Key, b.Key) })
	for i := range out {
		out[i].DependsOn = slices.Clone(out[i].DependsOn)
	}
	return out
}

// Validate checks the catalog as a whole: that every dependency names a
// registered app, and that the dependency graph is acyclic. Individual
// manifests are already validated by [Registry.Add].
//
// It is advisory and never called automatically — a host that catalogs its
// apps incrementally may be legitimately incomplete mid-startup, and the SDK
// will not decide for a host that a missing dependency is fatal. Call it once
// after the last Add; the errors it returns wrap [ErrUnknownDependency] and
// [ErrDependencyCycle], and multiple faults come back joined.
func (r *Registry) Validate() error {
	r.mu.RLock()
	graph := make(map[string][]string, len(r.byKey))
	for k, m := range r.byKey {
		graph[k] = slices.Clone(m.DependsOn)
	}
	r.mu.RUnlock()

	var faults []error
	for _, key := range slices.Sorted(maps.Keys(graph)) {
		for _, dep := range graph[key] {
			if _, ok := graph[dep]; !ok {
				faults = append(faults, fmt.Errorf("%w: app %q depends on %q, which no manifest declares", ErrUnknownDependency, key, dep))
			}
		}
	}
	for _, cycle := range findCycles(graph) {
		faults = append(faults, fmt.Errorf("%w: %s", ErrDependencyCycle, cycle))
	}
	return errors.Join(faults...)
}

// Mount invokes every added app's Register closure against a gated view of
// mux, so that every route an app registers is enablement-checked per request.
// Call it after the last [Registry.Add] and before serving.
//
// Mounting twice registers every route twice, which [net/http.ServeMux] treats
// as a conflict and panics on — the same as calling Handle twice yourself.
func (r *Registry) Mount(mux Router) {
	r.mu.RLock()
	apps := slices.Clone(r.apps)
	r.mu.RUnlock()
	for _, app := range apps {
		app.Register(gatedRouter{key: app.Key, reg: r, next: mux})
	}
}

// Gate wraps handler in the per-request enablement check for key, returning
// 404 with the code app_disabled when the app is off.
//
// [Registry.Mount] applies this to everything an app registers; Gate is the
// escape hatch for routes wired outside the registry — a host converting a
// legacy module can gate it before restructuring how it registers.
func (r *Registry) Gate(key string, handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if !r.IsEnabled(key) {
			respondDisabled(w, key)
			return
		}
		handler.ServeHTTP(w, req)
	})
}

// Sync writes every registered manifest to the [Store]: new apps are created
// (enabled), and existing apps have their metadata refreshed from code.
//
// Enablement is not touched, in either direction. Records this build does not
// recognise are left exactly as they are and reported as orphans, so that a
// rollback, a fork, or a branch with a different app set never destroys an
// operator's settings.
//
// Call it once at startup, after the last Add. A host whose migrations run
// after its first boot can treat a Sync failure as non-fatal: gating fails
// open, and the registry re-syncs itself when it next finds the store empty.
func (r *Registry) Sync(ctx context.Context) error {
	if r.store == nil {
		return ErrNoStore
	}
	manifests := r.Manifests()
	// Normalise nil to empty so every Store implementation can persist the
	// field without a nil check of its own.
	for i := range manifests {
		if manifests[i].DependsOn == nil {
			manifests[i].DependsOn = []string{}
		}
	}
	if err := r.store.Upsert(ctx, manifests); err != nil {
		return fmt.Errorf("apps: sync: %w", err)
	}

	records, err := r.store.Records(ctx)
	if err != nil {
		return fmt.Errorf("apps: sync orphan scan: %w", err)
	}
	r.mu.RLock()
	known := maps.Clone(r.byKey)
	r.mu.RUnlock()
	var orphans []string
	for _, rec := range records {
		if _, ok := known[rec.Key]; !ok {
			orphans = append(orphans, rec.Key)
		}
	}
	if len(orphans) > 0 {
		slices.Sort(orphans)
		r.logger.Warn("apps: registry has orphaned records (no manifest in this build)", "keys", orphans)
	}
	r.logger.Info("apps: registry synced", "apps", len(manifests), "orphans", len(orphans))
	return nil
}

// IsEnabled reports whether an app is enabled, reading from a cache refreshed
// at most every cache TTL (see [WithCacheTTL]).
//
// It fails open, always: an unknown key, a registry with no [Store], and a
// [Store] that errors all report enabled. A catalog that cannot be read is a
// reason to log, not a reason to take a working deployment offline.
func (r *Registry) IsEnabled(key string) bool {
	r.mu.RLock()
	fresh := r.cacheTTL > 0 && time.Since(r.cachedAt) < r.cacheTTL
	disabled := r.disabled[key]
	r.mu.RUnlock()
	if fresh {
		return !disabled
	}
	r.refreshCache()
	r.mu.RLock()
	defer r.mu.RUnlock()
	return !r.disabled[key]
}

// refreshCache re-reads enablement from the store. On failure it keeps serving
// the stale cache and marks it fresh, so a flapping store cannot turn every
// request into a failed query.
func (r *Registry) refreshCache() {
	if r.store == nil {
		r.markRefreshed()
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), storeTimeout)
	defer cancel()
	records, err := r.store.Records(ctx)
	if err != nil {
		r.logger.Warn("apps: enablement cache refresh failed; serving stale state", "error", err)
		r.markRefreshed()
		return
	}
	disabled := map[string]bool{}
	for _, rec := range records {
		if !rec.Enabled {
			disabled[rec.Key] = true
		}
	}
	r.mu.Lock()
	r.disabled = disabled
	r.cachedAt = time.Now()
	r.mu.Unlock()

	if len(records) == 0 {
		r.selfHeal(ctx)
	}
}

func (r *Registry) markRefreshed() {
	r.mu.Lock()
	r.cachedAt = time.Now()
	r.mu.Unlock()
}

// bustCache forces the next enablement read to hit the store, so a toggle is
// visible to the process that made it immediately rather than a TTL later.
func (r *Registry) bustCache() {
	r.mu.Lock()
	r.cachedAt = time.Time{}
	r.mu.Unlock()
}

// selfHeal re-syncs when the store is empty but this build has manifests to
// offer. That is the fresh-deployment race: on a platform that runs migrations
// as a post-deploy job, startup Sync fires before the table exists, the
// process stays up because gating fails open, and without this the catalog
// would stay empty until someone restarted it.
//
// Attempts are rate-limited to one per [DefaultCacheTTL] so that a store that
// is empty for some other reason cannot turn into a write loop. Returns true
// if a sync ran and succeeded.
func (r *Registry) selfHeal(ctx context.Context) bool {
	if r.store == nil {
		return false
	}
	r.mu.Lock()
	if len(r.byKey) == 0 || time.Since(r.healedAt) < DefaultCacheTTL {
		r.mu.Unlock()
		return false
	}
	r.healedAt = time.Now()
	r.mu.Unlock()

	syncCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), selfHealTimeout)
	defer cancel()
	if err := r.Sync(syncCtx); err != nil {
		r.logger.Warn("apps: self-heal sync failed", "error", err)
		return false
	}
	r.logger.Info("apps: registry self-healed an empty store (first boot on a fresh deployment)")
	return true
}

// List returns the whole catalog — every persisted record, orphans included —
// sorted by category then name, with live enablement.
//
// An empty result triggers one self-heal sync and a re-read, which is what
// makes the Apps page correct on the first boot of a fresh deployment rather
// than after a restart.
func (r *Registry) List(ctx context.Context) ([]Status, error) {
	out, err := r.listOnce(ctx)
	if err == nil && len(out) == 0 && r.selfHeal(ctx) {
		return r.listOnce(ctx)
	}
	return out, err
}

func (r *Registry) listOnce(ctx context.Context) ([]Status, error) {
	if r.store == nil {
		return nil, ErrNoStore
	}
	records, err := r.store.Records(ctx)
	if err != nil {
		return nil, fmt.Errorf("apps: list: %w", err)
	}
	r.mu.RLock()
	known := maps.Clone(r.byKey)
	r.mu.RUnlock()

	// Non-nil: an empty catalog must serialize as [], not null.
	out := make([]Status, 0, len(records))
	for _, rec := range records {
		if rec.DependsOn == nil {
			rec.DependsOn = []string{}
		}
		st := Status{Record: rec}
		if _, ok := known[rec.Key]; !ok {
			st.Orphaned = true
		}
		out = append(out, st)
	}
	slices.SortFunc(out, func(a, b Status) int {
		if c := cmp.Compare(a.Category, b.Category); c != 0 {
			return c
		}
		if c := cmp.Compare(a.Name, b.Name); c != 0 {
			return c
		}
		return cmp.Compare(a.Key, b.Key)
	})
	return out, nil
}

// SetEnabled turns an app on or off, after validating the dependency graph in
// both directions: enabling requires every dependency enabled, and disabling
// is refused while an enabled app still depends on this one. Core apps refuse
// to be disabled.
//
// Validation reads current enablement straight from the [Store] rather than
// the cache — a decision this consequential must not be made against state up
// to a TTL old. On success the change is written, the cache is busted so it
// takes effect immediately, and the [AuditSink], if any, is notified.
//
// Errors: [ErrNoStore], [ErrUnknownApp] for an unregistered or unsynced key,
// [ErrCoreApp], and [DependencyError] (via errors.As) for a graph conflict.
func (r *Registry) SetEnabled(ctx context.Context, key string, enabled bool) error {
	if r.store == nil {
		return ErrNoStore
	}
	r.mu.RLock()
	manifests := maps.Clone(r.byKey)
	r.mu.RUnlock()

	records, err := r.store.Records(ctx)
	if err != nil {
		return fmt.Errorf("apps: toggle read: %w", err)
	}
	current := make(map[string]bool, len(records))
	for _, rec := range records {
		current[rec.Key] = rec.Enabled
	}

	if err := validateToggle(manifests, current, key, enabled); err != nil {
		return err
	}

	found, err := r.store.SetEnabled(ctx, key, enabled)
	if err != nil {
		return fmt.Errorf("apps: toggle write: %w", err)
	}
	if !found {
		return fmt.Errorf("%w: %q has no record (run migrations or restart to sync)", ErrUnknownApp, key)
	}
	r.bustCache()
	r.logger.Info("apps: app toggled", "key", key, "enabled", enabled)
	if r.audit != nil {
		action := ActionDisable
		if enabled {
			action = ActionEnable
		}
		r.audit.RecordToggle(ctx, ToggleEvent{Action: action, Key: key, Enabled: enabled})
	}
	return nil
}

// validateToggle enforces the three rules — known key, core protection, and
// the dependency graph in both directions — as a pure function of the catalog
// and the current enablement, so the decision is testable without a store.
func validateToggle(manifests map[string]Manifest, current map[string]bool, key string, enable bool) error {
	m, known := manifests[key]
	if !known {
		return fmt.Errorf("%w: %q", ErrUnknownApp, key)
	}
	if enable {
		var missing []string
		for _, dep := range m.DependsOn {
			if depM, ok := manifests[dep]; ok && depM.Core {
				continue // core apps are always on, so they never block
			}
			if en, ok := current[dep]; ok && !en {
				missing = append(missing, dep)
			}
		}
		if len(missing) > 0 {
			slices.Sort(missing)
			return &DependencyError{Key: key, Enabling: true, Blockers: missing}
		}
		return nil
	}
	if m.Core {
		return fmt.Errorf("%w: %q", ErrCoreApp, key)
	}
	var dependents []string
	for k, other := range manifests {
		if k == key {
			continue
		}
		if enabled, ok := current[k]; ok && !enabled {
			continue // a disabled app does not block
		}
		if slices.Contains(other.DependsOn, key) {
			dependents = append(dependents, k)
		}
	}
	if len(dependents) > 0 {
		slices.Sort(dependents)
		return &DependencyError{Key: key, Enabling: false, Blockers: dependents}
	}
	return nil
}

// gatedRouter is the Router handed to apps: it interposes the enablement check
// on every handler registered through it, so an app cannot accidentally mount
// an ungated route.
type gatedRouter struct {
	key  string
	reg  *Registry
	next Router
}

func (g gatedRouter) Handle(pattern string, handler http.Handler) {
	g.next.Handle(pattern, g.reg.Gate(g.key, handler))
}

func (g gatedRouter) HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request)) {
	g.next.Handle(pattern, g.reg.Gate(g.key, http.HandlerFunc(handler)))
}

// respondDisabled is the answer a disabled app's routes give. The app_disabled
// code is the contract a client keys off to refresh its app state and explain
// itself, so it is fixed and must not change.
func respondDisabled(w http.ResponseWriter, key string) {
	writeJSON(w, http.StatusNotFound, errorEnvelope{
		Error: errorBody{
			Code:    CodeAppDisabled,
			Message: "The \"" + key + "\" app is disabled on this instance. An administrator can enable it.",
		},
	})
}

// findCycles returns one description per dependency cycle, using an iterative
// depth-first search so that a pathological catalog cannot exhaust the stack.
func findCycles(graph map[string][]string) []string {
	const (
		unvisited = 0
		active    = 1
		done      = 2
	)
	state := make(map[string]int, len(graph))
	var cycles []string
	var path []string

	for _, root := range slices.Sorted(maps.Keys(graph)) {
		if state[root] != unvisited {
			continue
		}
		// Each frame is (node, index of the next dependency to visit).
		type frame struct {
			node string
			next int
		}
		stack := []frame{{node: root}}
		state[root] = active
		path = append(path[:0], root)

		for len(stack) > 0 {
			top := &stack[len(stack)-1]
			deps := graph[top.node]
			if top.next >= len(deps) {
				state[top.node] = done
				stack = stack[:len(stack)-1]
				path = path[:len(path)-1]
				continue
			}
			dep := deps[top.next]
			top.next++
			if _, ok := graph[dep]; !ok {
				continue // unknown dependency: reported separately
			}
			switch state[dep] {
			case active:
				if i := slices.Index(path, dep); i >= 0 {
					cycles = append(cycles, strings.Join(append(slices.Clone(path[i:]), dep), " -> "))
				}
			case unvisited:
				state[dep] = active
				stack = append(stack, frame{node: dep})
				path = append(path, dep)
			}
		}
	}
	slices.Sort(cycles)
	return slices.Compact(cycles)
}
