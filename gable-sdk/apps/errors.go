// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"errors"
	"fmt"
	"strings"
)

// Sentinel errors returned by this package. Test for them with errors.Is;
// every error the SDK returns either is one of these or wraps one.
var (
	// ErrUnknownApp is returned when an operation names a key that has no
	// manifest compiled into this build. It also covers orphaned records —
	// rows a different build or fork wrote and this one knows nothing about.
	ErrUnknownApp = errors.New("apps: unknown app")

	// ErrCoreApp is returned when disabling an app whose manifest declares
	// Core. Core apps are the platform spine and are always on.
	ErrCoreApp = errors.New("apps: core apps cannot be disabled")

	// ErrNoStore is returned by the operations that need persistence
	// ([Registry.Sync], [Registry.List], [Registry.SetEnabled]) when the
	// registry was built without a [Store]. Enablement checks never return it:
	// they fail open.
	ErrNoStore = errors.New("apps: registry has no store")

	// ErrInvalidManifest is wrapped by every error [Manifest.Validate]
	// returns.
	ErrInvalidManifest = errors.New("apps: invalid manifest")

	// ErrDuplicateKey is wrapped by the value [Registry.Add] and
	// [Registry.AddStatic] panic with when a key is registered twice.
	ErrDuplicateKey = errors.New("apps: duplicate app key")

	// ErrUnknownDependency is wrapped by [Registry.Validate] when a manifest
	// depends on a key no manifest declares.
	ErrUnknownDependency = errors.New("apps: unknown dependency")

	// ErrDependencyCycle is wrapped by [Registry.Validate] when the dependency
	// graph contains a cycle. Apps in a cycle can never all be enabled.
	ErrDependencyCycle = errors.New("apps: dependency cycle")
)

// DependencyError reports an enable or disable refused by the dependency
// graph, naming the apps responsible so a UI can point straight at them.
//
// Recover it with errors.As. Blockers is always sorted, so the message and the
// machine-readable payload are stable across runs.
type DependencyError struct {
	// Key is the app whose toggle was refused.
	Key string
	// Enabling reports the direction: true if the refused operation was an
	// enable, false if it was a disable.
	Enabling bool
	// Blockers lists the app keys standing in the way — the disabled
	// dependencies when enabling, the enabled dependents when disabling.
	Blockers []string
}

// Error implements error.
func (e *DependencyError) Error() string {
	if e.Enabling {
		return fmt.Sprintf("cannot enable %q: requires disabled app(s) %s", e.Key, strings.Join(e.Blockers, ", "))
	}
	return fmt.Sprintf("cannot disable %q: still required by enabled app(s) %s", e.Key, strings.Join(e.Blockers, ", "))
}
