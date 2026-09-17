# Agent instruction files: where each one goes

`AGENTS.md` is canonical in every repository. `CLAUDE.md` contains one import line plus Claude-only notes. Kimi and Kilo read `AGENTS.md` directly. Product and platform repositories use the base file plus their addendum, concatenated into one `AGENTS.md` (base first, addendum after).

| File here | Goes to | As |
|---|---|---|
| `AGENTS.base.md` | Every App Shape app and platform repository | The top of `AGENTS.md` |
| `CLAUDE.md` | Every repository | `CLAUDE.md` |
| `AGENTS.hh.md` | `futurebuildai/hh` | Appended to the base in `AGENTS.md` |
| `AGENTS.gable.md` | The Gable product repository (and satellites until consolidated) | Appended to the base |
| `AGENTS.futureshade-core.md` | `futureshade/futureshade-core` | Appended to the base |
| `AGENTS.futureshade-agents.md` | `futureshade/futureshade-agents` | Appended to the base |
| `AGENTS.statecharts.md` | `futureshade/statecharts` | Appended to the base |
| `AGENTS.app.md` | `futureshade/app` (launcher and Shade client) | Appended to the base |
| `AGENTS.infra.md` | `futureshade/infra` | Appended to the base |
| `AGENTS.workstation.md` | `futureshade/workstation` | Appended to the base |
| `AGENTS.mirror.md` | Every `mirror-<name>` repository | `AGENTS.md` on its own (no base) |
| `AGENTS.hh_pro_dibbits.md` | `futurebuildai/hh_pro_dibbits` | `AGENTS.md` on its own; keep the existing `CLAUDE.md` and add the import line |
| `AGENTS.hardscapeos_dibbits.md` | `futurebuildai/hardscapeos_dibbits` | `AGENTS.md` on its own; the existing `CLAUDE.md` (PR #37) gains the import line |

Place `FUTURESHADE-CONTEXT.md` at `context/FUTURESHADE-CONTEXT.md` in `hh`, `infra`, and the client repositories, and reference it from `AGENTS.md` as the architecture authority.
