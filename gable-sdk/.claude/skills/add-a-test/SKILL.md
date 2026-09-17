---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
name: add-a-test
description: Add a table-driven Go test to the Gable Module SDK — covering a manifest rule, a registry invariant, a handler status code, or a Store contract — with the Connector SPDX header and no external dependencies. Use when the user says "add a test", "write a test for the registry", "this isn't covered", "improve test coverage", "what should I test", "help me contribute a test", "/write-a-test".
---

# add-a-test — protect the invariants

The value of a test here isn't coverage percentage. It's that this package makes several
**deliberate, counter-intuitive promises** to hosts, and a test is what stops a future refactor
from quietly withdrawing one.

---

## 1 · See what's covered

```bash
ls apps/*_test.go memstore/*_test.go 2>/dev/null
go test -race -cover ./...
go test -coverprofile=/tmp/c.out ./... && go tool cover -func=/tmp/c.out | tail -20
```

Read the existing suites before writing anything — copy the house idiom rather than inventing
one:

```bash
sed -n '1,80p' apps/fakes_test.go       # the test doubles the suite already has
sed -n '1,60p' apps/registry_test.go
sed -n '1,60p' apps/manifest_test.go
```

`apps/fakes_test.go` is where the fakes live. **Use them.** Adding a second fake `Store` when
one already exists just makes the suite harder to read.

## 2 · What's worth testing — the invariants first

Every one of these is documented in `apps/doc.go` or `apps/ports.go` and is a promise to hosts.
A test that pins one down is the highest-value thing you can write here.

| Invariant | The test |
|---|---|
| **Disable is per request, not by unregistering** | Register an app, disable it, hit its route → **404** with code **`app_disabled`**; re-enable → 200. No restart. |
| **Enablement fails open** | Registry with no `Store`, with an unknown key, and with a `Store` that returns an error → the app resolves **enabled** in all three cases. |
| **`Sync` never writes `Enabled`** | Persist a record as disabled, run `Sync`, assert it is still disabled. |
| **`Sync` never deletes** | Persist a record for an app the build no longer declares, run `Sync`, assert the orphan survives. |
| **`SetEnabled` on an unknown key** | Returns `ErrUnknownApp` and creates nothing. |
| **`Core` apps cannot be disabled** | Attempt it, assert the refusal and the correct status code. |
| **Cache TTL** | Change enablement in the `Store` behind the registry's back; assert the change is visible after the TTL, using an injected clock — **never a `time.Sleep`**. |
| **Manifest key syntax** | Table-test `Validate`: first char, allowed characters, `MaxKeyLength` (64) boundary at exactly 64 and 65, empty key, uppercase, leading digit, hyphen. |
| **Dependency validation** | Missing dependency, self-dependency, cycle. |
| **`Router` is satisfied by `*http.ServeMux`** | A compile-time assertion: `var _ apps.Router = (*http.ServeMux)(nil)`. |
| **`JSONErrorResponder` shape** | The default responder's status code, `Content-Type`, and body shape — hosts parse it. |

## 3 · Write it

Table-driven, standard library only. **No external test framework** — `testify` and friends are
dependencies, and this module has none by design (see `check-my-contribution` §3).

<!-- REUSE-IgnoreStart -->

```go
// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package apps

import "testing"

func TestManifestValidateKey(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{name: "simple lowercase", key: "millwork"},
		{name: "digits and underscores allowed after the first char", key: "pos_2"},
		{name: "empty key is rejected", key: "", wantErr: true},
		{name: "leading digit is rejected", key: "2pos", wantErr: true},
		{name: "uppercase is rejected", key: "Millwork", wantErr: true},
		{name: "hyphen is rejected", key: "mill-work", wantErr: true},
		{name: "exactly MaxKeyLength is accepted", key: strings.Repeat("a", MaxKeyLength)},
		{name: "one over MaxKeyLength is rejected", key: strings.Repeat("a", MaxKeyLength+1), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := Manifest{Key: tt.key, Name: "X"}
			err := m.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() with key %q: error = %v, wantErr %v", tt.key, err, tt.wantErr)
			}
		})
	}
}
```

<!-- REUSE-IgnoreEnd -->

**Read the source before you copy this.** Confirm `Validate` is the real method name and
signature — a test that doesn't compile wastes the reviewer's time.

For HTTP behaviour, use `net/http/httptest`:

```go
rec := httptest.NewRecorder()
mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/hello", nil))
if rec.Code != http.StatusNotFound {
	t.Fatalf("disabled app route: status = %d, want 404", rec.Code)
}
```

and assert the **machine-readable code** in the body, not just the status — hosts and clients
branch on `app_disabled`.

## 4 · Run it

```bash
gofmt -l .
go vet ./...
go test -race ./...
go test -race -run TestManifestValidateKey ./apps/
```

**Prove it can fail.** Break the code under test, watch the test go red, put it back. A test
that passes against broken code is not a test.

## 5 · House rules

**No tautological tests.** A test must be able to fail for a real reason. Don't restate the
implementation:

```go
// Worthless — recomputes what the code does.
want := strings.ToLower(input)
if got := normalise(input); got != want { ... }
```

Assert against a value you worked out **independently** — from the doc comment, from the spec,
by hand.

**Label characterization tests.** If you're pinning down what the code *currently* does because
nobody has decided what it *should* do, say so in the name and a comment:

```go
// Characterization test: documents current behaviour, NOT a specification.
// Whether a Store error should fail open is settled (it should — see doc.go),
// but the log level it emits is not. See issue #NNN.
func TestRegistry_CharacterizesStoreErrorLogging(t *testing.T) { ... }
```

**If you find a bug, report it — don't paper over it.** If the code disagrees with the
documented invariant, that's a real defect. Do **not** write the wrong value into `want:`.
Use **`report-an-issue`**, then either submit the failing test with `t.Skip("fails — see
#NNN")` and the issue linked, or fix the bug and the test in one PR saying clearly that you
changed behaviour.

**No dependencies.** Standard library only, including in tests.

**No flakiness.** No wall-clock `time.Sleep`, no dependence on map iteration order (`Records`
returns records *in any order* — the SDK sorts, so a test that assumes order is testing the
wrong thing), no network, no reliance on today's date. If you need time, inject a clock.

**Don't test the fake.** If your assertions only exercise `fakes_test.go`, delete the test.

## 6 · Ship it

```bash
git fetch origin
git switch -c test/manifest-key-validation origin/staging
git add apps/manifest_test.go
git commit -m "test(apps): table-driven coverage for Manifest.Validate key syntax"
```

> If `git switch` fails with `invalid reference: origin/staging`, this clone doesn't have
> `staging` yet — branch from the default branch and still open the PR **against `staging`**.

Then run **`check-my-contribution`**. In the PR description: which invariant is now protected,
anything you found that looks wrong (with the issue link), and anything you couldn't test.

---

## Ground rules

- Tests must be able to fail. Prove it by breaking the code once.
- Standard library only — no test framework, no dependencies.
- Prefer testing a **documented invariant** over testing a getter.
- Characterization tests are labelled as such, in the name and a comment.
- A discovered bug gets an issue, never a `want:` that encodes it.
- Connector SPDX header on every Go file.
- PR targets `staging`.
