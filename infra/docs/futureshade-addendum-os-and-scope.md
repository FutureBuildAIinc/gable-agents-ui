# Addendum: Workstation OS and v1 Scope Trims

Companion to `futureshade-e2e-stack-and-sessions.md`. Two decisions: what the 128 GB workstation runs, and which pieces of the estate stay SaaS for v1.

---

## 1. Workstation OS

### 1.1 What the workstation has to be good at

The workstation is not just a desktop. In the plan it is the fabrication host for Sessions, the local mirror of the estate, an optional runner and sandbox host managed by Coolify over Tailscale, and the home copy of the backups. That gives four hard requirements before any taste enters: Docker and a modern kernel that stay healthy, Tailscale and SSH that never break, rollback when an update goes wrong, and a toolchain (Go, Bun, Node, Tauri's GTK and WebKit dependencies, Postgres client, Appwrite CLI, Claude Code) that is reproducible so agents can rebuild it. Only then the soft requirement: the dual-screen cockpit from the stack guide, which wants keyboard-driven tiling.

### 1.2 Omarchy as it stands (Quattro, 4.0.x, September 2026)

Verified from current coverage:
- Arch plus Hyprland, now installed as regular pacman packages from Omarchy's own repository, which cleanly separates your modifications from the project's files (the old "dotfiles and scripts on Arch" objection is gone).
- Calamares installer; Btrfs plus Snapper plus Limine by default, so every pacman transaction gets a bootable snapshot and a broken update is a reboot away from undone; LUKS full-disk encryption offered by default; factory reset from a pristine snapshot.
- Four update channels. Stable is the default and tracks an Arch mirror one month behind upstream so incompatibilities are caught first; edge is current Arch. The cost of stable is that security updates for things like Chromium arrive later.
- Lua Hyprland configs, a plugin system, 24-colour theme engine, and an `omarchy` CLI of small composable helpers (`omarchy pkg add`, `omarchy theme set`, `omarchy update`), which is unusually agent-friendly.
- Docker, yay, LazyVim, a terminal, Chromium, and the usual developer set are in the base.
- Caveats: Secure Boot must be off to install (re-enabling later via a unified kernel image and sbctl is a documented community path); kernel bumps have caused hardware regressions on specific machines (a 3.7 kernel bug froze a Dell XPS panel until rolled back), which is exactly what the snapshots are for; NVIDIA works but needs the proprietary driver and a few Hyprland settings, and is the one component worth testing on a spare disk first.

### 1.3 The alternatives, briefly

| Option | Best at | Cost |
|---|---|---|
| Ubuntu 24.04 LTS (current), optionally with Omakub for DHH's curated tooling on GNOME | Boring, supported everywhere, widest vendor and driver docs, no learning curve | No tiling cockpit without a side project; snapshots need ZFS or Btrfs plus Timeshift set up by hand; Omakub is the older, less active cousin of Omarchy |
| NixOS | The purest "workstation as code": the whole machine is a declarative flake, rollback is built in, agents write Nix reasonably well now | A project in itself; Hyprland on NixOS is a configuration effort; slows S0 by weeks; the 2026 Omarchy versus NixOS comparisons say the same |
| Bluefin or Aurora DX (Universal Blue, immutable Fedora) | Near-zero maintenance, image-based updates with rollback, dev containers and Homebrew as the toolchain layer, NVIDIA images available | GNOME or KDE rather than tiling; the base image is built by a third party on GitHub infrastructure, which sits oddly with the sovereignty framing |
| CachyOS with Omarchy on top | Performance kernel plus the Omarchy layer | Two moving projects instead of one; not worth it for a runner host |

### 1.4 Recommendation

Move to Omarchy on the stable channel, and do it before S0, not during the plan. Reasons: it delivers the cockpit the stack guide describes, its snapshot-and-rollback model is stronger than what you have today on Ubuntu, its CLI is built for automation, and the packaging change in Quattro makes a FutureBuild layer on top maintainable. The rolling-release risk is real and is handled by three things you already want: the stable channel, Snapper rollback, and the rule that the workstation is never the only runner host (the sandbox droplet is always there).

Two conditions. First, test the GPU on a spare disk or USB install before wiping the desk; if it is NVIDIA and the test is unpleasant, stay on Ubuntu LTS and add Omakub and Timeshift instead. Second, make the toolchain reproducible independently of the distro so this decision is reversible: per-repo Nix dev shells or dev containers for Go, Bun, Node, and Tauri dependencies, so a fresh Omarchy or a fresh Ubuntu rebuilds the same environment from the repos.

If you would rather not touch the OS until the Gable launch is behind you, Ubuntu LTS plus Omakub plus Timeshift is the zero-drama path, and the Omarchy move becomes an Ops Session after S9. Both are defensible; the difference is when you pay for the cockpit.

### 1.5 If Omarchy: the FutureBuild layer

Keep upstream untouched and put every customisation in a `futurebuild-workstation` repo applied after install, idempotent, agent-runnable. Contents:

| Area | What goes in |
|---|---|
| Theme | A FutureBuild theme built from the same design tokens the Shade and Penpot use (`tokens.css` drives the 24-colour Omarchy theme, wallpaper, Waybar, terminal). One palette across OS, product, and canvas. |
| Cockpit | Lua Hyprland layer: monitor config, workspace rules that pin Claude Code and terminals to screen 1 and the browser (Shade, Console IV, Penpot) to screen 2, keybinds for "harness" and "canvas" focus, a Session layout that opens the worktree terminals and the QA dashboard. |
| Packages | Tailscale, OpenSSH server, Infisical CLI and agent, Claude Code, Bun, Go, Node, Tauri build dependencies (GTK, WebKitGTK, appindicator), Appwrite CLI, GitHub CLI, Postgres client, restic and autorestic, Obsidian, Docker (base) with data root on the large disk and log rotation. Installed through `omarchy pkg add` and yay, listed in one manifest file. |
| Services | `tailscaled` with `tag:workstation`; `sshd` key-only and bound to the tailnet address so Coolify can manage the machine; Docker daemon config; Snapper pre and post pacman snapshots (default) plus a daily timeline; a systemd user timer for the nightly restic pull from R2 or B2; the Infisical agent cache. |
| Security | LUKS on; nftables allowing only tailnet and loopback; no public ports; Secure Boot re-enabled via UKI and sbctl only if a client or insurer ever asks. |
| Update policy | Stable channel. `omarchy update` runs in the monthly Ops Session after draining runner containers, never mid-Session. Edge channel only on a spare disk for testing a fix you need early. |
| Agent conventions | A `CLAUDE.md` in the repo: install through `omarchy pkg add`, never edit files owned by Omarchy packages, put overrides in the sanctioned user config locations, snapshot before any system change, and keep the manifest as the single source of truth so a fresh install replays it. |
| Local mirror | The same `futureshade-infra` scripts as the cloud: Appwrite 2.0 on Postgres, dev Postgres, engine, agent tier, all under Docker; a `mirror up` and `mirror reset` pair that restores from seed dumps. |

---

## 2. v1 scope trims: GitHub and Infisical Cloud

Both trims are the right call for v1. Each removes a service to operate and a Session lane, keeps the architecture intact, and has a clean migration back to self-hosted when the launch is behind you. The two accepted SaaS dependencies go in the sovereignty ledger with their exit paths.

### 2.1 GitHub for v1

- Organisation `futureshade`, owned by the `futurebuildai` account. Settings: two-factor required, base permission read, repository creation restricted to owners, rulesets on `main` (pull request required, CI checks required, linear history, no force push), CODEOWNERS on the engine, statecharts, and infra repos.
- Repositories: `futureshade-core`, `futureshade-agents`, `statecharts`, `api`, `app`, `tauri`, `infra`, `workstation`, plus one per product under the same org or under the venture's own org later.
- CI: GitHub Actions with the templates from S1; a self-hosted runner on the workstation registered to the org for the heavy jobs, GitHub-hosted runners for the rest (check the free plan's Actions minutes for private repositories; the self-hosted runner makes them moot for anything long).
- Images: GHCR under the org; Coolify pulls with a read-only token.
- The dispatch actor authenticates as a GitHub App installed on the org (contents write, pull requests write, checks read, metadata read), never a personal access token. Installation tokens are short-lived and scoped to the org.
- Webhooks from GitHub to the engine for pull request and check events; Appwrite Sites uses its native GitHub integration for deployments and per-branch previews; Coolify uses its GitHub App for service deploys and PR previews.
- Dependabot on; secret scanning where the plan allows it.
- Exit path: Forgejo is git plus a compatible Actions dialect; the forge client in `futureshade-agents` is an interface with GitHub as the first implementation, and the Sites and Coolify integrations both speak Gitea. Migration is a mirror, a cutover of remotes, and a swap of the App for a Forgejo token.

### 2.2 Infisical Cloud for v1

- One organisation, one project per app (or one project with a path per app; pick one and keep it identical to what a self-hosted instance would use), environments dev, staging, prod.
- Machine identities per consumer: engine, agent tier, each runner host, CI (Infisical's GitHub Actions integration with OIDC auth avoids storing a long-lived Infisical token in GitHub), and the workstation. Humans use the CLI login with short-lived tokens.
- The workstation runs the Infisical agent for cached reads and `infisical run` for every local process; nothing changes from the self-hosted model except the URL.
- Choose the data region deliberately, review Infisical's current encryption model for the tier you are on, and enable audit logs.
- Exit path: Infisical exports and imports across instances; because paths, environments, and identities are identical, moving to a self-hosted instance under Coolify is a re-point of one URL per consumer plus re-issued identities.

### 2.3 Optional further trims while you are cutting

- Defer Grafana and Loki to S9 pre-launch; DigitalOcean Monitoring, Uptime Kuma, and Coolify's container logs cover S0 through S8.
- Move the LLM gateway from S1 to S6; nothing needs it until runners exist.
- Keep Penpot; Grant's loop depends on it from S8.

### 2.4 Effect on the Session plan

| Change | Where |
|---|---|
| S0 lane 4 becomes "Infisical Cloud org, projects, environments, machine identities, workstation agent" | S0 |
| S1 lane 1 becomes "GitHub org, rulesets, Actions templates, self-hosted runner on the workstation, GHCR, the dispatch GitHub App" | S1 |
| S1 lane 2 (LLM gateway) moves to S6 if the optional trim is taken | S1, S6 |
| S2 lane 4: Sites connects to GitHub natively; the Gitea provider verification is dropped | S2, C3 table |
| S2 lane 3: OIDC wiring covers Penpot, Grafana (when present), and forward-auth; GitHub keeps its own login; Infisical Cloud SSO is optional | S2 |
| S6 lane 5: forge integration is the GitHub App; Forgejo is not in v1 | S6 |
| Stack table A1: Forgejo and its registry become "GitHub org and GHCR (v1), Forgejo optional in S11"; A3: "Infisical Cloud (v1), self-hosted optional in S11" | Part A |
| Part B2: unchanged in substance; the vault URL is Infisical Cloud and the disaster copy is an Infisical export in the nightly backup set rather than a database dump | Part B |
| Sovereignty ledger: two accepted SaaS dependencies (GitHub, Infisical Cloud), plus Tailscale's control plane, each with a written exit path | Part D |
| Workstation OS: if Omarchy, the S0 workstation lane starts from a fresh Omarchy install and applies the FutureBuild layer; the toolchain is reproducible either way | S0 lane 6 |
