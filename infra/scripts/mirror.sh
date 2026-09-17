# mirror.sh <upstream_owner/name> <short-name> <default-branch>
set -euo pipefail
ORG="${ORG:-futureshade}"; UP="$1"; NAME="$2"; BR="${3:-main}"
gh repo create "$ORG/mirror-$NAME" --private --description "Private mirror of $UP with patch series on main" >/dev/null 2>&1 || true
git clone --mirror "https://github.com/$UP.git" "/tmp/$NAME.git"
( cd "/tmp/$NAME.git" && git push --mirror "git@github.com:$ORG/mirror-$NAME.git" )
git clone "git@github.com:$ORG/mirror-$NAME.git" "/tmp/$NAME" && cd "/tmp/$NAME"
git branch -f upstream "origin/$BR" && git push origin upstream
LATEST=$(git describe --tags --abbrev=0 "origin/$BR" 2>/dev/null || echo "$BR")
echo "$LATEST" > PINNED_TAG
printf '# Patches on main\n\nNone yet. Format: title | reason | ADR or issue | upstream PR or why not | date\n' > PATCHES.md
git add PINNED_TAG PATCHES.md && git commit -s -m "chore: pin $LATEST, start patch ledger" && git push origin HEAD:"$BR"
gh variable set UPSTREAM_URL --repo "$ORG/mirror-$NAME" --body "https://github.com/$UP.git"
gh variable set UPSTREAM_REPO --repo "$ORG/mirror-$NAME" --body "$UP"
gh variable set UPSTREAM_BRANCH --repo "$ORG/mirror-$NAME" --body "$BR"
echo "now add .github/workflows/upstream-sync.yml and the main ruleset"
