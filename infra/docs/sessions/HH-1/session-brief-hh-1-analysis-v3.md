# Session Brief: HH-1 Analysis and Transformation Path (v3)

**Type:** Read-only analysis Session. Output is a plan, not code
**Harness:** Claude Code or Kimi Code CLI swarm; reading lanes on Opus 5 or K3, synthesis on Fable 5.1 (in-session final pass or reviewed in the FutureShade project)
**Inputs on disk:** HH Pro repo, HardscapeOS ERP repo, `context/` with ADR-011, ADR-011a, ADR-011b, ADR-013, ADR-014, the sessions harness-routing note, the App Shape template skeleton if it exists

## Purpose

Produce the direct, session-by-session path from the current two apps to one App Shape monorepo with a unified Go core, role-based micro-apps in audience shells, and offline scopes, where every session in the path is itself an executable swarm brief. No durations, dates, or calendar references anywhere in the output.

## Hard rules

1. Read only. No edits, branches, or PRs in either repository; `git status` stays clean.
2. The HardscapeOS delivery in flight continues on its current stack until the path's own cutover session; the path must not require pausing, freezing, or rewriting that delivery, and it sequences the ERP's migration as a dependency chain, never as an estimate.
3. No secrets read or reproduced.
4. Every claim about a repo cites a path. Every lane brief in the output names the files or directories it touches.

## Lanes

| Lane | Model | Scope | Output |
|---|---|---|---|
| L1 HH Pro inventory | Opus 5 or K3 | Stack, screens, routes, roles, entities, integrations, pricing logic, auth, storage, offline behaviour, tests, build and deploy | `analysis/hhpro-inventory.md` |
| L2 HardscapeOS inventory | Opus 5 or K3 | Same, plus the six-gate criteria mapping and everything tied to the BisTrack replacement; in-flight branches noted separately | `analysis/hardscapeos-inventory.md` |
| L3 Domain unification | Opus 5 or K3 | Entity overlap and conflicts; the two pricing models compared field by field; a proposed unified model with open conflicts listed, not smoothed | `analysis/domain-map.md` |
| L4 Role and micro-app catalog | Opus 5 or K3 | Every user type and role; a draft catalog per ADR-011b (audience, roles, devices, kit, offline mode, shared entities, three jobs); shells per audience | `analysis/role-catalog.yaml` plus a one-page brief per micro-app |
| L5 Shape-fit and gaps | Fable | Distance from ADR-011 and ADR-011a: runtimes, identity, data conventions, API contract, offline readiness, design system; what moves, what is rewritten, what is dropped | `analysis/gap-analysis.md` |
| L6 Transformation path | Fable | The session-by-session plan in the format below, built from L1 to L5 | `analysis/transformation-path.md` plus one file per session under `analysis/sessions/` |

L1 to L4 run in parallel; L5 and L6 start when all four exist. L6 is the deliverable; everything else exists to make it correct.

## Required format of the transformation path

`transformation-path.md` opens with a dependency graph (which sessions block which, and where the ERP cutover session sits in the chain), then lists the sessions in order. Each session gets its own file, written so it can be handed to a swarm unchanged:

```
# <ID>: <name>
Goal: one sentence.
Preconditions: sessions or artifacts that must exist.
Position relative to the ERP cutover session: upstream | the cutover itself | downstream, with the reason.
Harness: claude | kimi | mixed, per the routing note (integrator and verifier on the strongest available model; security-critical lanes prefer Claude).

Lanes (parallel unless marked):
- <ID>.1 <lane name>
  Scope: what it builds or changes.
  Touches: paths and packages.
  Acceptance: tests or checks that prove it.
  Prompt: the lane's opening instruction, ready to paste.
- <ID>.2 ...

Integrator: how lanes merge into the QA branch; conflicts expected and how to resolve.
Verifier: the exit checks run on the QA branch (CI, model-based tests, contract tests, on-device checks where relevant).
Human checkpoints: start (brief approved), mid (design sync with Grant if UI), end (sign-off).
Exit test: observable conditions; no durations or dates.
Produces: artifacts, packages, ADR drafts.
Unlocks: the next sessions.
```

The path must cover, at minimum: the `hh` monorepo skeleton on the App Shape; the unified core (schema, migrations, sqlc, OpenAPI, JWKS auth, role gating, sync endpoints per declared scope); the shared packages (design system from tokens, auth with device unlock, offline-store with SQLite and wa-sqlite backends, the sync statechart with model-based tests); the internal shell and each internal micro-app by role priority from the catalog; HH Pro as the standalone public shell; data migration and seed datasets; the strangler cutover by role; `fb export` proof; and a closing section that maps the same sequence onto the Gable repos with the shared packages assumed present.

## Human checkpoints

- Start: Colton confirms repos, `context/`, and whether unstable ERP branches are excluded from reading.
- End: Colton reads `transformation-path.md` and the first three session files; Grant reads `role-catalog.yaml` and the micro-app briefs. Sign-off in the Plane HH-1 issue.

## Exit test

- All six analysis outputs exist; every repo claim has a path; both repos unchanged.
- Every session file in `analysis/sessions/` follows the format, has at least one lane with a paste-ready prompt, and names an exit test with no durations or dates.
- The dependency graph places every session upstream of, at, or downstream of the ERP cutover session with a reason.
- The domain map lists the pricing-model conflicts explicitly.

## Where the outputs go

- `analysis/` committed via a PR to the `hh` monorepo skeleton, or to `infra/docs/analysis/` if `hh` does not exist yet.
- Each session file becomes a Plane cycle with its lanes as issues (the `seed_plane.py` pattern), so the path is executed from the tracker.
- Decisions surfaced by the path (pricing model, shell split, first micro-app) become ADR drafts.

## Opening prompt

"You are running HH-1: analysis and transformation path. Read `context/` first; it defines the App Shape, the micro-app UX framework, the implementation model, the migration plan, and the harness routing rules you are planning against. This is a read-only session: do not modify either repository. Spawn one subagent per lane, write each output to `analysis/`, cite repository paths for every claim, and treat the in-flight HardscapeOS delivery as a dependency to sequence around, never as something to pause or estimate. Your deliverable is `analysis/transformation-path.md` and one executable swarm brief per session under `analysis/sessions/`, in the required format, with no durations, dates, or calendar references anywhere."
