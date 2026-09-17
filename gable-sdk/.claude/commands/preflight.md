---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
description: Run the pre-flight before opening a PR — build, vet, test -race, gofmt, zero-dependency check, invariants, SPDX.
argument-hint: [optional: a package or area to focus on]
---

Use the **check-my-contribution** skill.

Focus: $ARGUMENTS

Check for a Makefile and CI workflow first and run what is actually there. The zero-dependency gate in §3 and the invariant review in §4 are specific to this repo — do not skip them.
