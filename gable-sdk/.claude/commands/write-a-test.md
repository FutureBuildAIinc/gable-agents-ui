---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
description: Add a table-driven test that protects one of the SDK's documented invariants.
argument-hint: [optional: an invariant or type, or leave blank to pick a high-value one]
---

Use the **add-a-test** skill.

Target: $ARGUMENTS

If no target was given, run coverage first and recommend by value from the invariant table. Read `apps/fakes_test.go` and reuse the existing test doubles. Standard library only — no test framework. Prove the test can fail.
