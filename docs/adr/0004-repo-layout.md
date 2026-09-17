# ADR 0004 — Repo layout: vendored upstreams in one greenfield repo

**Status:** accepted · **Date:** 2026-09-17

## Context

This experiment spans four upstream codebases (BuilderIO/agent-native, FutureBuildAIinc/gable, FutureBuildAIinc/gable-sdk, FutureShade-Cloud-Ecosystem/infra). They were cloned, reviewed, then detached from their git origins per project direction: this is a greenfield repo, not a set of forks with upstream remotes.

## Decision

1. One git repo (`gable-agents-ui`) vendors all four trees at fixed snapshots; upstream histories and remotes are removed. Provenance is recorded in the initial commit message and here.
2. Our code lives in clearly separated locations:
   - `agent-native/packages/gable-client` (`@gable/client`) — shared TS package: gable REST client, Appwrite BYOA session, action helpers. A workspace package consumed by every `gable-*` template.
   - `agent-native/templates/gable-*` — the micro-UI apps (workspace members via the existing `templates/*` glob).
   - `gable/backend/pkg/eventpub` — the gable-side event emitter (Go).
   - `platform/` — Appwrite Functions + TablesDB schemas (not part of any upstream tree).
   - `docs/` — architecture, ADRs, conventions.
3. Upstream-sync is a manual, deliberate act (diff against the public upstreams, re-apply our patches), mirroring the infra repo's mirror philosophy (`infra/scripts/mirror.sh`): our patches are small and additive precisely so re-basing stays cheap. No upstream remote is configured in this repo.
4. The agent-native fork in this repo *is* the FB Factory base; new micro-UIs are added as `templates/gable-*` and registered in `packages/shared-app-config/templates.ts` when they are ready for the picker.

## Consequences

- One clone gives the full system; CI/build spans Go + pnpm workspaces.
- Losing upstream git history means security/bugfix tracking of upstreams is a manual watch (mitigated by the mirror scripts in `infra/scripts/` if re-adopted).
