#!/bin/sh
# County Search QC: prepare the always-on shared copy on a Linux machine with Docker (docs/REMOTE_ACCESS.md).
#
# Run once, from the str-qc folder:   sh deploy/setup.sh
# It asks for four things and writes them where only Docker reads them:
#   tailnet name        -> .env                        (QC_TAILNET=..., ignored by git)
#   GitHub token        -> deploy/secrets/github_token (read-only token for this one repository)
#   data passphrase     -> deploy/secrets/qc_passphrase
#   Tailscale auth key  -> deploy/secrets/ts_authkey
# Typed secrets are hidden on screen, never echoed, never put in shell history or on a command line.
# Each secret file is readable by its owner only (mode 600). Run it again to replace any of them.
set -eu
cd "$(dirname "$0")/.."
umask 077

hidden() { # prompt, variable name
  printf '%s: ' "$1" >&2
  stty -echo 2>/dev/null || true
  IFS= read -r "$2"
  stty echo 2>/dev/null || true
  printf '\n' >&2
}
save() { printf '%s' "$2" > "deploy/secrets/$1"; chmod 600 "deploy/secrets/$1"; echo "  saved $1"; }
die() { echo "$1" >&2; exit 1; }

echo "County Search QC: always-on copy setup"
echo
printf 'Tailnet name, from Tailscale admin > DNS (for example tail1234ab): '
IFS= read -r tailnet
tailnet=$(printf '%s' "$tailnet" | tr 'A-Z' 'a-z' | sed 's/\.ts\.net$//; s/[[:space:]]//g')
printf '%s' "$tailnet" | grep -Eq '^[a-z0-9-]+$' || die "The tailnet name has letters, digits and dashes only, for example tail1234ab."
printf 'QC_TAILNET=%s\n' "$tailnet" > .env
echo "  saved .env (the dashboard will answer at https://county-qc.$tailnet.ts.net)"

hidden 'GitHub fine-grained token (only str-qc, Contents: Read-only)' token
printf '%s' "$token" | grep -Eq '^(github_pat_|ghp_)[A-Za-z0-9_]+$' || die "That does not look like a GitHub token (it starts with github_pat_)."
case "$token" in ghp_*) echo "Warning: a classic token can reach every repository you own. A fine-grained token limited to str-qc is safer." >&2 ;; esac
save github_token "$token"

hidden 'Data passphrase (the one you type for "Save data to GitHub")' pass
[ "${#pass}" -ge 12 ] || die "The data passphrase has at least 12 characters."
hidden 'Same passphrase again' pass2
[ "$pass" = "$pass2" ] || die "The two passphrases differ. Nothing about the passphrase was saved."
save qc_passphrase "$pass"

hidden 'Tailscale auth key (Tailscale admin > Settings > Keys)' ts
case "$ts" in tskey-*) ;; *) die "A Tailscale auth key starts with tskey-." ;; esac
save ts_authkey "$ts"

unset token pass pass2 ts
# the dashboard container runs as user 1000 and must be able to read its two secrets
if [ "$(id -u)" != 1000 ]; then
  echo
  echo "The dashboard runs as user 1000 inside Docker. Give it its two files:"
  echo "  sudo chown 1000 deploy/secrets/github_token deploy/secrets/qc_passphrase"
fi
echo
echo "Done. Next, in this folder:"
echo "  docker compose up -d --build"
echo "  docker compose logs -f qc        (wait for \"data updated\", then Ctrl+C)"
echo "Then open https://county-qc.$tailnet.ts.net and share the machine with Bhavik (docs/REMOTE_ACCESS.md, step 6)."
