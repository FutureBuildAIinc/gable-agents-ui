<!--
SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
-->

# Contributing to the Gable Module SDK with Claude Code

**If you want to build an installable app for a Gable host and ship it under your own licence
— open or closed — this repository is the reason you can.**

`gable-sdk` is the **connector seam** of the OpenLBM Standard: the whole module is
`LicenseRef-OpenLBM-Connector-1.0`, the permissive no-copyleft Profile. You write an app
against it, plug it into a copyleft host, and no licence crosses the boundary. That promise is
the product, and two rules keep it honest — **zero third-party dependencies** and **the SDK
never imports the host**.

This is the most technical repository in the ecosystem. It's also the smallest and the best
documented: `apps/doc.go` is the design document, and almost every question is answered by
`go doc`. This guide shows you how to work in it with **Claude Code**, an AI assistant that
loads a repo-aware kit the moment you open the folder.

---

## Start here: writing an app

You do not need to contribute to this repository to use it. Most people who read this file want
to *build against* the SDK, so here is the whole model in one screen.

An **app** is a `Manifest` declaring its identity plus a registration closure that mounts its
HTTP routes:

```go
var App = apps.Manifest{
    Key:       "millwork",                              // lowercase; a natural primary key
    Name:      "Millwork",
    Summary:   "Door, window, and trim configuration.",
    Category:  "Operations",
    DependsOn: []string{"product"},
}
```

A **host** builds a registry, adds apps, mounts them, exposes the enable/disable API, and syncs
manifests into its store:

```go
store := memstore.New()                      // or your own apps.Store
reg := apps.NewRegistry(apps.WithStore(store))
reg.Add(apps.App{
    Manifest: App,
    Register: func(r apps.Router) {
        r.HandleFunc("GET /api/v1/millwork/...", handler)
    },
})

mux := http.NewServeMux()
reg.Mount(mux)                               // routes go up, gated
apps.NewHandler(reg).RegisterRoutes(mux, adminOnly)
_ = reg.Sync(ctx)                            // manifests -> Store
```

That's it. Everything else is a consequence. Ask Claude `/newcomer-tour` and it will walk you
through `apps/doc.go`, `apps/ports.go`, and the three host ports with real line numbers.

---

## What Claude Code is

Claude Code is a command-line tool from Anthropic. You point it at a folder, describe what you
want in ordinary English, and it reads the files, runs commands, and makes changes — showing you
each step and asking before it does anything significant.

It is not magic and it is not always right. Think of it as a fast, tireless colleague who has
read every doc comment in this package but has never had to keep a host running in production.
You supply the judgement.

### Install it

1. **Get the repository onto your computer.** You need [Git](https://git-scm.com/downloads) and
   a Go toolchain (the module targets **Go 1.25** — see [`go.mod`](./go.mod)).
   ```bash
   git clone https://github.com/FutureBuildAIinc/gable-sdk.git
   cd gable-sdk
   go test -race ./...
   ```
2. **Install Claude Code.** Follow the official instructions at
   <https://docs.claude.com/en/docs/claude-code/overview>. You will need a Claude account.
3. **Start it, from inside the `gable-sdk` folder:**
   ```bash
   claude
   ```

That's it. Type what you want in plain English and press enter.

### The kit loads itself

This repository ships a `.claude/` folder containing everything below — the skills, the
slash-command shortcuts, and a `settings.json` that pre-approves the Go toolchain commands
(`go build`, `go vet`, `go test`, `go doc`, `go list`, `gofmt`, `go tool cover`), `reuse lint`,
and read-only `git`, while blocking reads of `.env` files. When you start Claude Code from
inside `gable-sdk`, it picks all of that up automatically.

You don't install anything. You don't configure anything. It's already there.

---

## The skills

A **skill** is a set of instructions Claude follows for a particular kind of job. You never have
to name one — describe what you want and the right skill activates. Each also has a **slash
command** shortcut if you prefer.

| Skill | Shortcut | Use it when |
|---|---|---|
| **explain-this-code** | `/newcomer-tour` | "Where do I start?", "How do I write an app?", "How does enable/disable actually work?", "What is the connector seam?" It reads `go doc ./apps` first and teaches you the lookup so you don't need it next time. |
| **add-a-test** | `/write-a-test` | You want to protect one of the SDK's documented invariants. Table-driven, standard library only, and it **proves the test can fail** by breaking the code once. A great first contribution. |
| **check-my-contribution** | `/preflight` | You're about to open a pull request. `gofmt`, `go vet`, `go build`, `go test -race`, the zero-dependency gate, the no-host-imports check, the invariant review, exported-API diff, SPDX, `reuse lint`. |
| **licensing-check** | `/license-of` | "Do I have to open-source my app?", "Is this Apache?", "Can my company use this?" Answers precisely — and the precision is about **what you import**, not about the SDK. |
| **report-an-issue** | `/file-issue` | The code disagrees with its documented contract, a contract is unclear, or a capability is missing. It makes you rule out the deliberate behaviours first. |

There is deliberately **no** `improve-docs` skill here: this package's documentation *is* its
doc comments, so a docs change is a code change and goes through `check-my-contribution`.

---

## The invariants — read these before you change anything

These are documented in `apps/doc.go` and `apps/ports.go`, and several of them **look like bugs
and are not**. Claude will quote them at you; better that you know them first.

| Invariant | Why |
|---|---|
| **Disable is enforced per request, not by unregistering routes.** A disabled app's routes answer **404** with the machine-readable code `app_disabled`. | `net/http.ServeMux` cannot unregister a pattern, and a per-request gate makes toggles take effect without a restart. |
| **Enablement fails *open*.** An unknown key, a missing `Store`, or a `Store` error all resolve to **enabled**. | *The registry must never take a working host down.* Making it fail closed is a design change, not a fix. |
| **Enablement is read through a short-TTL cache** (`DefaultCacheTTL`). | A change made directly in the store isn't visible instantly. Not a bug. |
| **`Sync` never deletes and never writes `Enabled`.** | Enablement is operator-owned state; metadata refreshes from code. Orphans stay visible rather than being destroyed. |
| **`Store.Upsert` must never write `Enabled`.** | An operator's setting survives every deploy. |
| **`SetEnabled` never creates a record** — an unknown key returns `ErrUnknownApp`. | A key with no record hasn't been synced; the SDK won't invent an app. |
| **`Core` apps cannot be disabled.** | They're the platform spine. |
| **`Manifest.Key` is a natural primary key** — lowercase ASCII letter first, then lowercase letters, digits, or underscores, at most `MaxKeyLength` (64). | Changing a key renames the app as far as the operator's saved enablement is concerned. Pick it once. |
| **`Router` stays a strict subset of `net/http.ServeMux`**, satisfied by `*http.ServeMux` directly. | That's how the SDK constrains what an app can do to a host's mux without wrapping it. |
| **`Records` returns records in any order.** The SDK sorts. | A host depending on store order depends on something the contract doesn't promise. |

If your change deliberately alters one of these, **say so at the top of the PR description**. A
silent change to an invariant is the worst thing that can happen to this package.

---

## Three worked examples

### 1 · You're an app author and you're not sure you're on the permissive side

This is the question the repository exists to answer, and it has a precise answer.

**Type this:**

> I'm writing a closed-source millwork configurator for a customer. Do I have to publish it?

**What happens:** Claude runs the `licensing-check` skill. It will lead with the headline — the
whole of `gable-sdk` is `LicenseRef-OpenLBM-Connector-1.0`, permissive, no copyleft — and then
be precise about the thing people actually get wrong, which is **the import boundary**:

| What your app imports | Where you land |
|---|---|
| Only `github.com/FutureBuildAIinc/gable-sdk/...` | Connector side — permissive |
| `FutureBuildAIinc/gable` → `backend/pkg/apps/` | Still the connector seam in the host repo — Connector |
| `FutureBuildAIinc/gable` → `backend/internal/...` | You have reached into **Commons** — copyleft applies |
| `FutureBuildAIinc/gable` → `app/...` | **Surface** Profile |

**Most specific path wins**, which is why `backend/pkg/apps/` is carved out of the
`backend/pkg/` Commons default in the host repo's licence map.

It will also say two things you might not want to hear. First: *this is not legal advice* —
read [`LICENSES/LicenseRef-OpenLBM-Connector-1.0.txt`](./LICENSES/LicenseRef-OpenLBM-Connector-1.0.txt),
note its status marker, and have counsel look at it. Second: **"no copyleft" is not "no
eligibility gates."** The Connector Profile's permissiveness is about copyleft; the Standard's
Size and Field-of-use gates still exist. Canonical definitions live in
<https://github.com/FutureBuildAIinc/openlbm> and supersede any summary.

### 2 · You want a first contribution and you don't know what to write

**Type this:**

> What isn't covered? Pick a high-value invariant and write a table-driven test.

**What happens:** the `add-a-test` skill. Claude computes coverage live rather than trusting a
stale list, then recommends from the invariant table above — because the value of a test here
isn't a coverage percentage, it's that a future refactor can't quietly withdraw a promise the
package makes to hosts.

It reads `apps/fakes_test.go` and **reuses the existing test doubles** rather than inventing a
second fake `Store`. It writes standard-library-only, table-driven Go — **no `testify`, no test
framework**, because this module has zero dependencies by design and that includes tests. It
runs `go test -race` the way CI does. And it **proves the test can fail** by breaking the code
once and watching it go red.

Then the house rules bite. No tautological tests — don't recompute what the code does and assert
they match; derive the expected value independently, from the doc comment. If it's pinning down
current behaviour that nobody has decided is *correct*, it's labelled a characterization test in
the name and a comment. And if it finds a real bug — the code disagreeing with the documented
invariant — it files an issue rather than writing the wrong value into `want:`.

Time is injected, never slept on: the cache-TTL test uses a clock, not `time.Sleep`.

### 3 · You're about to open a PR

**Type this:**

> /preflight

**What happens:** the `check-my-contribution` skill runs the gates for real and refuses to
report one as passing if it didn't execute it. Beyond the usual `gofmt` / `go vet` /
`go build` / `go test -race`, two are specific to this repo:

**The zero-dependency gate.** [`go.mod`](./go.mod) has no `require` block and that is
load-bearing:

```bash
go list -deps ./... | grep -v '^github.com/FutureBuildAIinc/gable-sdk' | grep -v '^vendor/' | grep '\.'
grep -n "require" go.mod || echo "clean: no requires"
ls go.sum 2>/dev/null && echo "WARNING: a dependency was added"
```

**Adding a dependency here is a licensing decision, not a convenience decision.** If your change
needs one, stop and open an issue explaining why.

**The no-host-imports check.** Everything the SDK needs from a host is a port it owns —
`Store`, `AuditSink`, `ErrorResponder`, `Router` in `apps/ports.go`. Nothing there names a
database, an ORM, a log framework, or an HTTP helper library.

It also diffs the exported API (`go doc -all ./apps` before and after) and checks that the doc
comments still describe what the code does — because the design lives in the doc comments, a
behaviour change that leaves `apps/doc.go` stale is an incomplete change.

---

## The ground rules

These apply whether or not you used AI.

**1 · Pull requests target `staging`, never `main`.**
Maintainers fast-forward `staging → main` after review. If your clone doesn't have `staging`
yet, branch from `main` and still open the PR **against `staging`**.

**2 · Never commit a secret.**
No API keys, tokens, passwords, or `.env` files. If one lands in a commit, deleting it later
doesn't help — it stays in history. Rotate the credential first, then tell a maintainer. The
kit's `.claude/settings.json` blocks reading `.env` files for exactly this reason.

**3 · The SPDX header must match the directory.**
This repository is deliberately near-uniform: **every Go file, and `go.mod` itself, is
`LicenseRef-OpenLBM-Connector-1.0`** — that's the whole point of the repo.

<!-- REUSE-IgnoreStart -->

```go
// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
```

<!-- REUSE-IgnoreEnd -->

Markdown, **including everything under `.claude/`**, is `LicenseRef-OpenLBM-Docs-1.0` with an
HTML-comment header, or `#` comments inside YAML frontmatter for files that have any. Anything
that can't hold a comment gets a `<filename>.license` sidecar. The per-component map for the
wider ecosystem is
[`LICENSE-MAP.md` in `FutureBuildAIinc/gable`](https://github.com/FutureBuildAIinc/gable/blob/main/LICENSE-MAP.md).
Ask with `/license-of <path>` if unsure, and run `reuse lint` before you push.

**4 · Security problems go through the private channel, not a public issue.**
An **enablement bypass** — reaching a route that should be gated — is a genuine security issue,
because hosts rely on that gate. So is a data leak across a boundary, or a credential in the
repo. This repository has no `SECURITY.md` of its own yet, so follow
[the policy in `FutureBuildAIinc/gable`](https://github.com/FutureBuildAIinc/gable/blob/main/SECURITY.md):
the **Security** tab → **Report a vulnerability**, or **security@futurebuild.ai**.

**5 · Never paste in copyleft or competitor material.**
Contributing GPL-licensed code to the connector seam would poison exactly the promise the seam
exists to make. Same for competitor documentation, schemas, or API specifications.

**6 · The module is v0.x** — expected stable, not frozen. Any exported-signature change goes in
the PR description explicitly, with whether it's source-compatible.

**7 · Run `/preflight` before you push**, and keep commits focused — one logical change each.

**8 · Contributions are licensed under `LicenseRef-OpenLBM-Connector-1.0`, via a CLA.**
You'll be asked to agree before your first merge.

---

## An honest note about AI-assisted contributions

**AI-assisted contributions are welcome here.** We built this kit on purpose.

But there's a bargain, and it isn't negotiable:

> **You are responsible for what you submit.** Your name goes on the pull request. When a
> reviewer asks "why does this work?", "AI wrote it" is not an answer.

There's a failure mode specific to this package that you should watch for: **several of its
invariants look like bugs.** An AI reading the code cold — or reading your bug report
sympathetically — may cheerfully "fix" fail-open enablement, or make `Sync` clean up orphans,
or unregister a disabled app's routes. Each of those is a design decision with a written
rationale, and each of those "fixes" is a regression that would reach every host.

Concretely, before you open a PR:

- **Read every line of the diff.** If you don't understand a change, ask Claude to explain it
  until you do — or drop it.
- **Run it yourself.** `go test -race ./...`, and `/preflight`. Break the code once and confirm
  your new test actually goes red.
- **Check it against `go doc`, not against the AI's summary.** The contract is written down.
  Open `apps/doc.go` and `apps/ports.go` and compare.
- **Treat any dependency suggestion as a red flag.** If Claude proposes pulling in a library,
  the answer is almost certainly no, and the reason is licensing, not taste.
- **Check the facts.** Claude can state a wrong file path, a wrong method name, or a
  plausible-sounding command with complete confidence. Everything in this kit was verified
  against the repository when it was written, but the repository moves. If a command in a skill
  doesn't exist any more, that's a bug — file it with `/file-issue`.
- **Say that you used AI** in the PR description. Nobody minds. It helps reviewers know where to
  look hardest.

And the flip side: **a failing test attached to an issue is a complete contribution.** This
package has no dependencies and no infrastructure, so a reproduction is usually twenty lines.
That's worth more than a patch nobody can evaluate.

---

## Where to go next

| You want to… | Go to |
|---|---|
| Read the design — this is the real documentation | [`apps/doc.go`](./apps/doc.go), or `go doc ./apps` |
| Understand the three host ports | [`apps/ports.go`](./apps/ports.go) |
| See how a host persists the catalogue | [`memstore/memstore.go`](./memstore/memstore.go) |
| See the existing test idiom before writing one | [`apps/fakes_test.go`](./apps/fakes_test.go), [`apps/registry_test.go`](./apps/registry_test.go), [`apps/manifest_test.go`](./apps/manifest_test.go) |
| Read the licence that governs this module | [`LICENSES/LicenseRef-OpenLBM-Connector-1.0.txt`](./LICENSES/LicenseRef-OpenLBM-Connector-1.0.txt) and [`LICENSE`](./LICENSE) |
| See the reference host that consumes this seam | [`FutureBuildAIinc/gable`](https://github.com/FutureBuildAIinc/gable) → `backend/pkg/apps/` |
| Understand the licensing Standard | <https://github.com/FutureBuildAIinc/openlbm> |
| Report a security problem | [`gable/SECURITY.md`](https://github.com/FutureBuildAIinc/gable/blob/main/SECURITY.md) |
