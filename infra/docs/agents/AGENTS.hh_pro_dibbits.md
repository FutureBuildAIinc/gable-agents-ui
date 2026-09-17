# hh_pro_dibbits instructions

This repository is HH Pro as it exists today and the home of the HH-1 analysis (`analysis/`). It is a strangler source: its screens move into the `hh` monorepo by role, and the new core serves its domain rules server-side.

- No behaviour changes here outside a named HH session lane. Bug fixes needed before a role switches are ported to `hh` in the same PR series and recorded in `hh/core/db/PORTED.md` where they touch data.
- `analysis/` is read-only history once copied into `hh/docs/analysis/`; decisions are made in `hh`.
- The supplier port and ERP read adapter are contract-tested; do not change their contract from here.
- No CI exists in this repository; any change is verified by the `hh` contract tests against the recorded fixtures.
- House rules apply: no em or en dashes, no secrets, DCO sign-off, PRs only.
