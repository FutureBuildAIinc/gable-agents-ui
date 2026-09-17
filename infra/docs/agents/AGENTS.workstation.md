# workstation addendum

The FutureBuild layer for the workstation (Omarchy or Ubuntu): package manifest, theme from the shared tokens, Hyprland cockpit rules, services (Tailscale, SSH for Coolify, Docker, Snapper, restic pull), the `session` runner, hook policies for Claude Code, Kimi, and Kilo, personas, and the local mirror scripts.

- Never edit files owned by Omarchy packages; overrides go in the sanctioned user config locations. Install packages through the manifest, not by hand.
- Snapshot before any system change; updates only in the Ops window after draining runner containers.
- The `session` runner creates one worktree per lane and launches the chosen harness (`--harness claude|kimi|kilo|mixed`); it never merges. Isolated home directories for concurrent Kimi processes.
- The hook policy is the same deny-by-default set for every harness: writes only inside the worktree, no secrets paths, no force push, no package publishing.
- The local mirror is built by the same `infra` scripts as the cloud; `mirror up` and `mirror reset` restore from seed dumps, never from production data.
- Interactive sessions run on subscriptions; nothing here holds or forwards a platform API key.
