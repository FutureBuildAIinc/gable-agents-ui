// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import (
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestManifestValidate(t *testing.T) {
	t.Parallel()
	longKey := strings.Repeat("a", MaxKeyLength+1)

	tests := []struct {
		name     string
		manifest Manifest
		wantErr  bool
		// wantMsg, when set, must appear in the error so a regression that
		// merely rejects for the wrong reason still fails.
		wantMsg string
	}{
		{
			name:     "minimal valid",
			manifest: Manifest{Key: "millwork", Name: "Millwork"},
		},
		{
			name: "fully populated",
			manifest: Manifest{
				Key: "purchase_order", Name: "Purchase Orders",
				Summary: "Vendor POs.", Category: "Procurement", Core: true,
				DependsOn: []string{"vendor", "product"},
			},
		},
		{
			name:     "digits and underscores in key",
			manifest: Manifest{Key: "edi_997_ack", Name: "EDI 997"},
		},
		{
			name:     "key at the length limit",
			manifest: Manifest{Key: strings.Repeat("a", MaxKeyLength), Name: "Long"},
		},
		{
			name:     "empty depends_on slice",
			manifest: Manifest{Key: "gl", Name: "General Ledger", DependsOn: []string{}},
		},
		{
			name:     "missing key",
			manifest: Manifest{Name: "Nameless"},
			wantErr:  true, wantMsg: "key is required",
		},
		{
			name:     "missing name",
			manifest: Manifest{Key: "gl"},
			wantErr:  true, wantMsg: "name is required",
		},
		{
			name:     "uppercase key",
			manifest: Manifest{Key: "Millwork", Name: "Millwork"},
			wantErr:  true, wantMsg: "must start with a lowercase letter",
		},
		{
			name:     "key starting with a digit",
			manifest: Manifest{Key: "3d", Name: "3D"},
			wantErr:  true, wantMsg: "must start with a lowercase letter",
		},
		{
			name:     "key starting with an underscore",
			manifest: Manifest{Key: "_hidden", Name: "Hidden"},
			wantErr:  true, wantMsg: "must start with a lowercase letter",
		},
		{
			name:     "hyphen in key",
			manifest: Manifest{Key: "bank-recon", Name: "Bank Reconciliation"},
			wantErr:  true, wantMsg: "lowercase letters, digits, and underscores",
		},
		{
			name:     "path separator in key",
			manifest: Manifest{Key: "a/b", Name: "Slash"},
			wantErr:  true, wantMsg: "lowercase letters, digits, and underscores",
		},
		{
			name:     "key over the length limit",
			manifest: Manifest{Key: longKey, Name: "Long"},
			wantErr:  true, wantMsg: "longer than",
		},
		{
			name:     "empty dependency",
			manifest: Manifest{Key: "gl", Name: "GL", DependsOn: []string{""}},
			wantErr:  true, wantMsg: "empty key",
		},
		{
			name:     "self dependency",
			manifest: Manifest{Key: "gl", Name: "GL", DependsOn: []string{"gl"}},
			wantErr:  true, wantMsg: "depends on itself",
		},
		{
			name:     "duplicate dependency",
			manifest: Manifest{Key: "gl", Name: "GL", DependsOn: []string{"account", "account"}},
			wantErr:  true, wantMsg: "duplicate dependency",
		},
		{
			name:     "malformed dependency key",
			manifest: Manifest{Key: "gl", Name: "GL", DependsOn: []string{"Account"}},
			wantErr:  true, wantMsg: "dependency \"Account\"",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.manifest.Validate()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("Validate() = nil, want error")
				}
				if !errors.Is(err, ErrInvalidManifest) {
					t.Errorf("error %v does not wrap ErrInvalidManifest", err)
				}
				if tc.wantMsg != "" && !strings.Contains(err.Error(), tc.wantMsg) {
					t.Errorf("error %q does not contain %q", err, tc.wantMsg)
				}
				return
			}
			if err != nil {
				t.Fatalf("Validate() = %v, want nil", err)
			}
		})
	}
}

// hostCatalogKeys are the app keys the reference host declares today. The key
// syntax rule is a compatibility promise, not just a style preference: if a
// future tightening would reject a key a shipped host already stores, this
// test fails before it reaches anyone's deployment.
var hostCatalogKeys = []string{
	"account", "ai", "ap", "bankrecon", "config", "crm", "customer", "dashboard",
	"delivery", "document", "domain", "edi", "gl", "governance", "integrations",
	"inventory", "invoice", "location", "matching", "millwork", "notification",
	"order", "parsing", "partner", "payment", "pim", "portal", "pos", "pricing",
	"product", "project", "purchase_order", "quote", "reporting", "salesteam",
	"tax", "techadmin", "vendor", "vision",
}

func TestManifestValidate_AcceptsEveryHostCatalogKey(t *testing.T) {
	t.Parallel()
	if len(hostCatalogKeys) != 39 {
		t.Fatalf("host catalog snapshot has %d keys, want 39", len(hostCatalogKeys))
	}
	for _, key := range hostCatalogKeys {
		m := Manifest{Key: key, Name: key}
		if err := m.Validate(); err != nil {
			t.Errorf("host key %q rejected: %v", key, err)
		}
	}
}

// A *http.ServeMux must keep satisfying Router: apps rely on being testable
// against a plain mux with no registry at all.
var _ Router = (*http.ServeMux)(nil)

// The func adapters must keep satisfying their ports; these are the one-line
// bridges a host uses instead of declaring a type.
var (
	_ AuditSink      = AuditSinkFunc(nil)
	_ ErrorResponder = ErrorResponderFunc(nil)
	_ ErrorResponder = JSONErrorResponder{}
)
