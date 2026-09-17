---
# SPDX-License-Identifier: LicenseRef-OpenLBM-Docs-1.0
# SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors
description: Explain the Connector licence, the import boundary, and which SPDX header a file needs.
argument-hint: [a path, or a licensing question]
---

Use the **licensing-check** skill.

Question: $ARGUMENTS

Lead with the headline: the whole of this module is `LicenseRef-OpenLBM-Connector-1.0`, permissive and no-copyleft, so an app built against it can be closed source. Be precise about the import boundary — reaching into the host's `backend/internal/` lands in Commons. Never call OpenLBM "open source" without the fair-source qualifier.
