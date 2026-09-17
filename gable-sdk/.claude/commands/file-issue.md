---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
description: Report an SDK bug, an unclear contract, or a missing capability.
argument-hint: [what you found]
---

Use the **report-an-issue** skill.

The finding: $ARGUMENTS

Check it against the documented contract in `apps/doc.go` first, and rule out the deliberate behaviours — fail-open enablement, per-request 404 with `app_disabled`, cached TTL, Sync never deleting or writing Enabled, unordered Records. An enablement bypass is a security issue and goes through the private channel.
