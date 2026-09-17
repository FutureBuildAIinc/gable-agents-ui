---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
name: licensing-check
description: Explain why the Gable Module SDK is permissively licensed, what LicenseRef-OpenLBM-Connector-1.0 means for someone writing an app against it, and which SPDX header a file needs. Use when the user says "what licence is this", "do I have to open-source my app", "can I write a closed-source plug-in", "is this Apache", "what SPDX header do I need", "can my company use this SDK", "/license-of".
---

# licensing-check — why this repo is the permissive one

The headline, and the reason this module exists as its own repository:

> **The whole of `gable-sdk` is `LicenseRef-OpenLBM-Connector-1.0`** — the permissive,
> no-copyleft profile of the OpenLBM Standard. You can write an app against it **under any
> licence, open or closed**, and plug it into a copyleft host without a licence crossing the
> boundary.

That promise is the product. Everything else in this skill is a consequence of protecting it.

---

## 1 · The header, for every file here

<!-- REUSE-IgnoreStart -->

```go
// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
```

<!-- REUSE-IgnoreEnd -->

Applies to `go.mod` too — check `head -3 go.mod`.

Markdown (including everything under `.claude/`) is `LicenseRef-OpenLBM-Docs-1.0` with an
HTML-comment header, or `#` comments inside YAML frontmatter for files that have any. Files
that can't hold a comment get a `<filename>.license` sidecar with the two `SPDX-` lines.

The full text is in `LICENSES/LicenseRef-OpenLBM-Connector-1.0.txt`. **Read it before quoting
it**, and state its status: the OpenLBM Standard is **published and effective at version 1.0**. The canonical texts live at <https://github.com/FutureBuildAIinc/openlbm>; the copies under `LICENSES/` in each repo are vendored so the repository is self-contained and REUSE-compliant offline. Where a vendored copy and the published Standard ever disagree, **the published Standard governs**.

## 2 · How the boundary is actually kept

A permissive licence on the seam is necessary but not sufficient — the code has to stay clean
too. Two rules do the work:

**Zero third-party dependencies.** `go.mod` has no `require` block. A dependency would drag its
own licence into the seam and could reach downstream into every app built on it.

```bash
grep -n "require" go.mod || echo "clean"
go list -deps ./... | grep -v '^github.com/FutureBuildAIinc/gable-sdk' | grep -v '^vendor/' | grep '\.'
ls go.sum 2>/dev/null && echo "WARNING: a dependency was added"
```

**The SDK never imports the host.** Everything it needs from a host is a port it owns — `Store`,
`AuditSink`, `ErrorResponder`, `Router` (see `apps/ports.go`). No database, ORM, log framework,
or HTTP helper appears in an interface signature.

```bash
grep -rn "FutureBuildAIinc/gable\"" --include='*.go' . | grep -v gable-sdk
```

**Adding a dependency here is a licensing decision, not a convenience decision.** Treat a PR
that adds one as a proposal to change the licensing posture, and route it to a maintainer.

## 3 · Answering "must I publish my app?"

Against **this module**: no. That's the design intent of the Connector profile.

But be precise about where the boundary is — this is where people get it wrong:

| What your app imports | Where you land |
|---|---|
| Only `github.com/FutureBuildAIinc/gable-sdk/...` | Connector side — permissive |
| `FutureBuildAIinc/gable` → `backend/pkg/apps/` | Still the connector seam in the host repo — Connector |
| `FutureBuildAIinc/gable` → `backend/internal/...` | You have reached into **Commons** — copyleft applies |
| `FutureBuildAIinc/gable` → `app/...` | **Surface** profile |

**Most specific path wins**, which is why `backend/pkg/apps/` is carved out of the
`backend/pkg/` Commons default in the host repo's `LICENSE-MAP.md` and `REUSE.toml`.

So the honest answer is: *"Depends on what you import. Import only the SDK and you're on the
permissive side. Reach into the host's internals and you aren't. This is not legal advice —
have counsel read the Connector text and the Standard."*

## 4 · The wider model, briefly

OpenLBM is **fair source**, not OSI-approved open source. Never drop that qualifier. One
Standard, several profiles:

| Profile | Covers | Roughly |
|---|---|---|
| **Commons** | The core ERP | Reciprocity conditioned on size |
| **Surface** | Client surfaces and native apps | Reciprocity on distribution |
| **Connector** | **This module** and the host's `pkg/apps/` seam | Permissive, no copyleft |
| **Community-Source** | Community satellites | Free for members, fee for others; per work, not per directory |
| **Docs** | Documentation and specs | Docs terms |
| **Trademark** | The Gable marks | A brand-use policy — grants **no** code rights |

Three eligibility gates apply across the Standard — **Size**, **Field-of-use** (a Competing
Vendor exclusion that gates legacy LBM vendors regardless of size), and **Participation**
(governance rights only, **not** the grant). Canonical definitions live in
`FutureBuildAIinc/openlbm` and supersede any summary, including this one.

Worth stating plainly: **the Connector profile's permissiveness is about copyleft, not about
eligibility.** "No copyleft" does not mean the eligibility gates evaporate.

## 5 · Contributing to this repo

Inbound contributions are licensed under `LicenseRef-OpenLBM-Connector-1.0` — the same licence
that governs the files — via a Contributor License Agreement you'll be asked to sign before your
first merge.

That means: **do not paste code in here from a copyleft source.** Contributing GPL-licensed
code to the connector seam would poison exactly the promise the seam exists to make. Same for
competitor documentation, schemas, or API specifications.

## 6 · Using the Gable name for your app

Separate question, separate instrument. `LicenseRef-OpenLBM-Trademark` is a brand-use **policy**
with assets in `FutureBuildAIinc/brand`. **No code licence grants trademark rights** — the
Connector licence lets you build and ship a plug-in; it does not let you call it Gable.

---

## Ground rules

- **The permissive promise is the product.** Protect the zero-dependency and no-host-import
  rules; flag any PR that touches them.
- **Be precise about the import boundary** — the SDK is permissive, `backend/internal/` is not.
- **Never call OpenLBM "open source"** without the fair-source qualifier.
- **State the draft status** when quoting a licence text.
- **No copyleft code contributed here.**
- **You are not counsel.** Explain, then point at the Standard and a lawyer.
- **Trademark is separate.**
