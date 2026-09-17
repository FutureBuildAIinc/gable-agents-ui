---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
name: check-my-contribution
description: Run the pre-flight before opening a pull request against the Gable Module SDK — go build, go vet, go test -race, gofmt, the zero-dependency check, the Connector SPDX header on every file, no host imports, and that the PR targets staging. Use when the user says "check my work", "am I ready to open a PR", "run the pre-flight", "will CI pass", "did I break anything", "review my changes before I push", "/preflight", or is about to commit or push.
---

# check-my-contribution — pre-flight for the Module SDK

Actually run the gates. **Do not declare "looks good" without having executed the commands.**

---

## 0 · What the repo itself gates on

```bash
ls Makefile .github/workflows/ 2>/dev/null
[ -f Makefile ] && make help
[ -f .github/workflows/ci.yml ] && grep -n "name:\|run:" .github/workflows/ci.yml
```

**If a `Makefile` or a CI workflow exists, it is the source of truth and wins over this skill.**
This repo is young; run what's there.

## 1 · What changed

```bash
git rev-parse --abbrev-ref HEAD
git status --short
git diff --stat origin/staging...HEAD 2>/dev/null || git diff --stat
```

## 2 · Go gates

```bash
gofmt -l .                # must print nothing
go vet ./...
go build ./...
go test -race ./...
```

Use `-race`. This package is explicitly documented as safe for concurrent use — `Registry`
calls `Store.Records` from request goroutines whenever its enablement cache expires — so a data
race here is a real defect, not a test artefact.

Coverage is worth a look on a package this small:

```bash
go test -race -cover ./...
```

## 3 · The zero-dependency gate — the one that's specific to this repo

`go.mod` has **no `require` block**, and that is load-bearing. This package is the connector
seam: it is permissively licensed so a third party can plug an app into a copyleft host without
a licence crossing the boundary, and it keeps that promise by depending on nothing but the
standard library.

```bash
# Must print nothing but the stdlib.
go list -deps ./... | grep -v '^github.com/FutureBuildAIinc/gable-sdk' | grep -v '^vendor/' | grep '\.' 

# go.mod must have no require block.
grep -n "require" go.mod || echo "clean: no requires"

# go.sum should not exist (or be empty).
ls go.sum 2>/dev/null && echo "WARNING: go.sum present — a dependency was added"
```

**Adding a dependency here is a licensing decision, not a convenience decision.** If your change
needs one, stop and open an issue explaining why — don't slip it into a PR.

Related, and just as important:

```bash
# The SDK must never import the host.
grep -rn "FutureBuildAIinc/gable\"" --include='*.go' . | grep -v gable-sdk
grep -rn "internal/" --include='*.go' . 
```

Nothing should match.

## 4 · The invariants — read your own diff against them

```bash
git diff origin/staging...HEAD 2>/dev/null || git diff
```

For each changed line, check it doesn't quietly break one of these (all documented in
`apps/doc.go` and `apps/ports.go`):

- [ ] **Disable is per request**, not by unregistering routes. Disabled routes answer **404**
      with code **`app_disabled`**.
- [ ] **Enablement fails open** — unknown key, missing `Store`, or `Store` error all resolve to
      enabled. *The registry must never take a working host down.* Making this fail closed is a
      design change, not a fix.
- [ ] **`Sync` never deletes and never writes `Enabled`.** Orphans stay visible.
- [ ] **`Store.Upsert` never writes `Enabled`.** Operator settings survive deploys.
- [ ] **`SetEnabled` never creates a record** — unknown key returns `ErrUnknownApp`.
- [ ] **`Core` apps cannot be disabled.**
- [ ] **`Router` stays a strict subset of `net/http.ServeMux`**, satisfied by `*http.ServeMux`
      directly.
- [ ] **Ports name no concrete technology** — no database, ORM, log framework, or HTTP helper
      library in an interface signature.

If your change deliberately alters one of these, say so at the top of the PR description. A
silent change to an invariant is the worst thing that can happen to this package.

## 5 · API stability

The module is **v0.x** — expected stable, not frozen. Still, check whether you changed an
exported signature:

```bash
go doc -all ./apps > /tmp/apps-after.txt
git stash && go doc -all ./apps > /tmp/apps-before.txt && git stash pop
diff /tmp/apps-before.txt /tmp/apps-after.txt
```

Any exported change goes in the PR description explicitly, with whether it's source-compatible.

## 6 · SPDX headers

**Every file in this repository is `LicenseRef-OpenLBM-Connector-1.0`** — that's the point of
the repo. Go files:

<!-- REUSE-IgnoreStart -->

```go
// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
```

<!-- REUSE-IgnoreEnd -->

Markdown files (including anything under `.claude/`) are `LicenseRef-OpenLBM-Docs-1.0` with an
HTML-comment header, or `#` comments inside YAML frontmatter where the file has any.

<!-- REUSE-IgnoreStart -->

```bash
for f in $(git diff --name-only --diff-filter=A origin/staging...HEAD 2>/dev/null || git diff --name-only --diff-filter=A); do
  case "$f" in *.license) continue ;; esac
  printf '%-52s %s\n' "$f" "$(grep -m1 -o 'SPDX-License-Identifier: .*' "$f" 2>/dev/null || echo 'MISSING')"
done
reuse lint        # pipx install reuse   (this ecosystem's CI pins 6.2.0)
```

<!-- REUSE-IgnoreEnd -->

If `reuse` isn't installed, report `SKIPPED` — don't claim it passed.

## 7 · Documentation

This package's design lives in its doc comments, so a behaviour change that leaves `doc.go` or
a port's contract comment stale is an incomplete change.

```bash
go doc ./apps            # does the overview still describe what the code does?
go doc ./apps <Type>     # for each type you touched
```

## 8 · Hygiene and the PR

```bash
git diff origin/staging...HEAD 2>/dev/null | \
  grep -nE 'sk-or-v1-|dop_v1_|ghp_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
git diff --name-only origin/staging...HEAD 2>/dev/null | grep -E '(^|/)\.env(\.|$)'
```

- **PR targets `staging`**, not `main`.
- Commits are focused, one logical change each.
- Inbound contributions are licensed under `LicenseRef-OpenLBM-Connector-1.0` via the CLA.

---

## Reporting back

```
Gate                    Result
gofmt -l .              PASS
go vet ./...            PASS
go build ./...          PASS
go test -race ./...     FAIL — apps: TestRegistrySyncPreservesEnabled
zero dependencies       PASS
no host imports         PASS
invariants              PASS
exported API changed    yes — Registry.Mount now returns error (source-incompatible)
SPDX headers            PASS
reuse lint              SKIPPED — reuse not installed
doc comments current    FAIL — doc.go still describes the old Mount signature
PR target               staging
```

Then, for each failure: the exact command, the exact error, and the smallest fix.
