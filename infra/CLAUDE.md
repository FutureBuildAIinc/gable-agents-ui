@AGENTS.md

# Claude-only notes
- One subagent per lane, each in its own worktree; the integrator merges lanes into `qa/<session>`; the verifier runs the exit checks and writes the report the PR needs.
- Use the repository's hooks as configured; do not disable or bypass them. Deploy scripts, secrets paths, and `ee/` directories are denied by hook and by instruction.
- Prefer reading `docs/adr/` and the brief over asking; ask only at the human checkpoints the brief names.
- Dependency additions and destructive git operations escalate to a reviewer card; do not perform them.
