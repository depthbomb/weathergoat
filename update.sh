#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

FORCE=false
for arg in "$@"; do
    case $arg in
        -f|--force) FORCE=true ;;
    esac
done

START_TIME=$(date +%s)

step() { echo -e "\n${CYAN}${BOLD}▶  $1${RESET}"; }
ok()   { echo -e "${GREEN}${BOLD}✔  $1${RESET}"; }

trap 'echo -e "\n${RED}${BOLD}✘  Update failed (step above)${RESET}" >&2; exit 1' ERR

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  WeatherGoat  ·  $(date '+%Y-%m-%d %H:%M:%S')${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

step "Pulling latest changes"
PULL_OUTPUT=$(git pull --ff-only)
echo "$PULL_OUTPUT"

if [[ "$PULL_OUTPUT" == "Already up to date." ]] && [[ "$FORCE" == false ]]; then
    echo -e "\n${BOLD}Already up to date — nothing to do. Use -f to force.${RESET}\n"
    exit 0
fi

ok "Repository updated"

step "Installing dependencies"
bun install --frozen-lockfile
ok "Dependencies installed"

step "Generating Prisma client"
bun run generate-client
ok "Prisma client generated"

step "Generating messages"
bun run generate-messages
ok "Messages generated"

step "Running database migrations"
bun run migrate:p
ok "Migrations applied"

step "Restarting wg.service"
sudo systemctl restart wg.service
ok "Service restarted"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo -e "\n${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  All done in ${ELAPSED}s${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
