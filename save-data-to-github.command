#!/usr/bin/env bash
# County Search QC on a Mac: lock the dashboard's data with your passphrase and send it to GitHub (private repository).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and double-click this again."
  read -r -p "Press Enter to close." _
  exit 1
fi
node scripts/save.mjs
read -r -p "Press Enter to close." _
