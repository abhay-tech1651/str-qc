#!/usr/bin/env bash
# County Search QC on a Mac: double-click to open the dashboard at http://127.0.0.1:3000. Close the window to stop it.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and double-click this again."
  read -r -p "Press Enter to close." _
  exit 1
fi
node scripts/start.mjs || read -r -p "Something went wrong (see above). Press Enter to close." _
