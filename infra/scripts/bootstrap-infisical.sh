#!/usr/bin/env bash
# bootstrap-infisical.sh
set -euo pipefail
# Ubuntu install (Arch later: AUR package infisical-bin)
if ! command -v infisical >/dev/null; then
  curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | sudo -E bash
  sudo apt-get install -y infisical
fi

infisical login            # choose the Cloud domain matching your region
# in each first-party repo checkout:
#   infisical init         # links the repo to project futureshade, env dev
# seed a few dev values (examples)
infisical secrets set --env=dev --path=/workstation MIRROR_PG_URL="postgres://..." 
infisical secrets set --env=dev --path=/infra RESTIC_REPOSITORY="s3:..." 
# run anything with secrets injected, never from .env files
infisical run --env=dev --path=/infra -- ./scripts/plan.sh
