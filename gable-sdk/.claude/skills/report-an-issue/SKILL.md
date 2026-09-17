---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
name: report-an-issue
description: Report a bug, an unclear contract, or a missing capability in the Gable Module SDK. Use when the user says "the registry does the wrong thing", "a disabled app still responds", "Sync wiped my enablement", "the docs don't match the behaviour", "I found a bug", "this API is missing", "file an issue", "report a problem", "/file-issue".
---

# report-an-issue — SDK defects, contracts, and gaps

The SDK's contracts are written down in `apps/doc.go` and the doc comments in `apps/ports.go`.
So most reports here reduce to one question: **does the code do what the documentation
promises?**

Answer that before filing, and the issue writes itself.

---

## 0 · Security first

If the report involves bypassing an enablement gate to reach a route that should be closed,
leaking data across a boundary, or a credential in the repo, **do not open a public issue**.
Check `ls SECURITY.md` here and in `FutureBuildAIinc/gable`, then use the private channel: the
repository's **Security** tab → **Report a vulnerability**, or **security@futurebuild.ai**.

An enablement bypass is a genuine security issue — hosts rely on the gate.

## 1 · Check it against the documented contract first

```bash
go doc ./apps                 # the package overview
go doc ./apps Registry
go doc ./apps Store
sed -n '1,80p' apps/ports.go  # the port contracts, in prose
```

**These behaviours look like bugs and are deliberate.** Check each before filing:

- **A disabled app's routes still exist on the mux, and answer 404 rather than being
  unregistered.** `net/http.ServeMux` cannot unregister a pattern; the per-request gate is what
  makes toggles work without a restart. The 404 carries the code `app_disabled`.
- **Enablement fails *open*.** An unknown key, a missing `Store`, or a `Store` error all resolve
  to **enabled**. Documented and intentional: *the registry must never take a working host
  down.* "My app was enabled when the database was down" is expected behaviour.
- **Enablement is cached with a short TTL**, so a change made directly in the store isn't
  visible instantly. Not a bug.
- **`Sync` never deletes and never writes `Enabled`.** If a record for an app your build no
  longer declares is still there, that's the orphan-preservation rule.
- **`Records` returns records in any order.** The SDK sorts; a host that depends on store order
  is depending on something the contract doesn't promise.
- **`SetEnabled` on a never-synced key returns `ErrUnknownApp`** rather than creating a record.
- **`Core` apps can't be disabled.**

If the behaviour you hit is one of these, the useful issue is usually *"the documentation should
say this more prominently"* or *"this should be configurable"* — both legitimate, and much
better received than "bug: disabled app returns 404".

## 2 · Reduce it to a failing test

The single most valuable thing you can attach. This package has no dependencies and no
infrastructure, so a reproduction is usually 20 lines:

```go
func TestReproduce(t *testing.T) {
	store := memstore.New()
	reg := apps.NewRegistry(apps.WithStore(store))
	// ... the smallest sequence that shows the problem
}
```

```bash
go test -race -run TestReproduce ./apps/
```

Paste the test and its output. If you can't reduce it, say so and give the sequence of calls.

## 3 · Gather

```bash
git rev-parse --short HEAD
git rev-parse --abbrev-ref HEAD
go version
cat go.mod
go doc ./apps <TheType>          # the contract you believe is violated
```

## 4 · Write it

Check for a template (`ls .github/ISSUE_TEMPLATE/`). Otherwise:

```markdown
## Kind
Contract violation | Unclear contract | Missing capability | Documentation mismatch

## Version
Commit `<sha>` on `<branch>`, Go `<version>`

## What the documentation promises
> verbatim quote from `apps/doc.go` or the doc comment, with the file name

## What the code does
The smallest reproduction — a failing test if you have one — and its output.

## Impact on a host
Who breaks, and how badly. "A host that restarts during a Store outage sees every app enabled"
is much more actionable than "this seems wrong".

## Ruled out
Which of the deliberate behaviours in this skill's §1 you checked.

## Suggested fix
Optional. Note whether it would change an exported signature or an invariant — the maintainers
need to know that up front.
```

## 5 · Missing capability, rather than a bug

For "the SDK should be able to X", answer these in the issue:

- **Which port would it touch** — `Store`, `AuditSink`, `ErrorResponder`, `Router` — or would it
  need a new one?
- **Can it be done without a dependency?** If not, say so explicitly; that makes it a licensing
  decision (see `licensing-check` §2) and a maintainer call.
- **Does it change an exported signature?** The module is v0.x — expected stable, not frozen —
  so breaking changes are possible but deliberate.
- **Could a host already do this** by supplying its own port implementation? Often yes, and
  that's the intended answer.

---

## Ground rules

- **Enablement-bypass and data-leak reports go through the private channel**, never a public
  issue.
- **Quote the documented contract** you believe is violated, with the file name.
- **Rule out the deliberate behaviours** in §1 and say which you checked.
- **Attach a failing test** if you can — there's no excuse of "hard to reproduce" in a
  dependency-free package.
- **One defect per issue.**
- **Never paste code from a copyleft or third-party source** into an issue in this repo.
