# hardscapeos_dibbits instructions

This repository is the HardscapeOS ERP delivery for Dibbits Landscape Supply, in flight, with its own gate criteria. It is the source of the `hh` core: the Go monolith is carried into `hh` with additive retrofits.

- This delivery is never paused, frozen, or rewritten by an `hh` session. Work here continues on its current stack until the cutover session in the HH path.
- Every change landed here during the delivery is recorded by the `hh` tracking lane in `hh/core/db/PORTED.md` as ported or deferred with a reason. If you land a migration, a pricing rule, or a portal route here, note it in the PR description so the tracking lane sees it.
- The ERP's test suite is the regression armour for the shared schema; keep it green and keep it runnable from a clean checkout.
- The contractor portal's BFF (`/api/portal/v1`) is a read contract HH Pro depends on; changing it is a coordinated change with `hh`.
- The pricing resolver is untouched by the HH path until the sales roles switch; changes to it here are business changes, recorded and surfaced in the pre-switch difference report.
- House rules apply: no em or en dashes, no secrets, DCO sign-off, PRs only. `CLAUDE.md` imports this file.
