// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"fmt"
	"net/http"
)

// MaxKeyLength is the longest app key [Manifest.Validate] accepts. Keys are
// natural primary keys in the host's catalog store and travel in URLs and JSON
// error payloads, so they are deliberately short.
const MaxKeyLength = 64

// Manifest is an app's declared identity — the whole of what the platform
// knows about an app before it registers a single route.
//
// A manifest is data, not code: it is the row the host stores, the entry the
// Apps page renders, and the node the dependency validator reasons about. Apps
// conventionally declare theirs as a package-level var in their own package:
//
//	var App = apps.Manifest{
//		Key:      "millwork",
//		Name:     "Millwork",
//		Summary:  "Door, window, and trim configuration.",
//		Category: "Operations",
//		DependsOn: []string{"product"},
//	}
type Manifest struct {
	// Key is the stable machine identifier for the app, unique across the
	// host. It is the primary key in the [Store], so changing it renames the
	// app as far as the operator's saved enablement is concerned — pick it
	// once. Must match the key syntax enforced by [Manifest.Validate]:
	// lowercase ASCII letter first, then lowercase letters, digits, or
	// underscores, at most [MaxKeyLength] characters.
	Key string `json:"key"`

	// Name is the human-facing app name shown on the Apps page. Required.
	Name string `json:"name"`

	// Summary is a one-line description for the Apps page. Optional.
	Summary string `json:"summary"`

	// Category groups apps on the Apps page (for example "Sales", "Finance",
	// "Platform"). Optional; [Registry.List] sorts by category then name, so
	// apps that leave it empty sort first.
	Category string `json:"category"`

	// Core marks an app that cannot be disabled — the platform spine. A core
	// app still appears in the catalog; [Registry.SetEnabled] refuses to turn
	// it off with [ErrCoreApp], and a core app never blocks another app from
	// being enabled (core apps are always on by definition).
	Core bool `json:"core"`

	// DependsOn lists the keys of apps that must be enabled for this app to be
	// enabled. It is validated in both directions: enabling requires these to
	// be enabled, and disabling is refused while an enabled app still depends
	// on this one. Libraries and services that are not themselves apps must
	// not appear here. May be nil.
	DependsOn []string `json:"depends_on"`
}

// Validate reports whether the manifest is well formed. Every returned error
// wraps [ErrInvalidManifest], so callers can test with errors.Is.
//
// It checks that Key is present and syntactically valid, that Name is present,
// and that DependsOn holds no blank entries, no duplicates, no syntactically
// invalid keys, and no self-reference (an app that depends on itself could
// never be enabled). Summary and Category are free-form and never rejected.
//
// Validate does not — and cannot — check that the keys in DependsOn exist:
// that is a whole-catalog property, checked by [Registry.Validate] once every
// app has been added.
func (m Manifest) Validate() error {
	if m.Key == "" {
		return fmt.Errorf("%w: key is required", ErrInvalidManifest)
	}
	if reason := keyFault(m.Key); reason != "" {
		return fmt.Errorf("%w: key %q %s", ErrInvalidManifest, m.Key, reason)
	}
	if m.Name == "" {
		return fmt.Errorf("%w: app %q: name is required", ErrInvalidManifest, m.Key)
	}
	seen := make(map[string]bool, len(m.DependsOn))
	for _, dep := range m.DependsOn {
		switch {
		case dep == "":
			return fmt.Errorf("%w: app %q: depends_on contains an empty key", ErrInvalidManifest, m.Key)
		case dep == m.Key:
			return fmt.Errorf("%w: app %q depends on itself", ErrInvalidManifest, m.Key)
		case seen[dep]:
			return fmt.Errorf("%w: app %q: duplicate dependency %q", ErrInvalidManifest, m.Key, dep)
		}
		if reason := keyFault(dep); reason != "" {
			return fmt.Errorf("%w: app %q: dependency %q %s", ErrInvalidManifest, m.Key, dep, reason)
		}
		seen[dep] = true
	}
	return nil
}

// keyFault reports why key is not a valid app key, or "" if it is. It enforces
// the syntax by hand rather than with regexp: the rule is four lines, and the
// SDK's zero-dependency promise extends to keeping its stdlib footprint small.
func keyFault(key string) string {
	if len(key) > MaxKeyLength {
		return fmt.Sprintf("is longer than %d characters", MaxKeyLength)
	}
	for i := 0; i < len(key); i++ {
		c := key[i]
		switch {
		case c >= 'a' && c <= 'z':
		case i > 0 && (c >= '0' && c <= '9' || c == '_'):
		case i == 0:
			return "must start with a lowercase letter"
		default:
			return "must contain only lowercase letters, digits, and underscores"
		}
	}
	return ""
}

// Router is the registration surface a host hands to an app: exactly the
// subset of [net/http.ServeMux] apps are allowed to use, and nothing else.
//
// Narrowing the surface to two methods is what makes the seam portable. The
// registry passes apps a gated implementation so every handler they register
// is enablement-checked per request, and *http.ServeMux satisfies Router
// directly, so an app can be exercised in a test against a plain mux with no
// registry at all.
//
// Patterns follow Go 1.22+ [net/http.ServeMux] syntax, including the
// "METHOD /path/{wildcard}" form.
type Router interface {
	// Handle registers handler for pattern.
	Handle(pattern string, handler http.Handler)
	// HandleFunc registers handler for pattern.
	HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request))
}

// App pairs a manifest with the closure that registers the app's routes.
//
// Register is called once, by [Registry.Mount], with a gated [Router]. The app
// binds its own middleware — auth, role guards, rate limits — inside the
// closure; the SDK deliberately has no opinion about any of them. One App may
// register the routes of several of the host's internal modules when they ship
// and toggle as a single unit.
type App struct {
	Manifest
	// Register mounts the app's routes on the supplied Router. Required.
	Register func(r Router)
}
