# Sharing the dashboard privately (Bhavik and you, any time)

The dashboard holds County's search terms, spend and agency notes, so it is never put on the open internet.
It is shared over **Tailscale**: a private network between the devices you approve. There is no public link,
no open port, and every connection is encrypted end to end. Only people you invite to your tailnet can open it.

## Two ways to run it

| | A. From your laptop | B. Always on (recommended for Bhavik) |
|---|---|---|
| Works when | your laptop is on and the dashboard is running | always |
| Data | your laptop's data, live | the copy you last saved with "Save data to GitHub", refreshed every 10 minutes |
| Who can import | you, on the laptop | nobody: this copy is read-only; you import on the laptop and save |
| Cost | free | a small always-on machine: an office PC with Docker, or a cloud VM (about ₹500–900 a month) |
| Setup | 10 minutes | 30 minutes, once |

Both need a free Tailscale account (yours) and Bhavik invited to it. Create the account yourself at tailscale.com; the
dashboard never asks for or stores Google or Tailscale passwords.

## A. From your laptop

1. Install Tailscale on the laptop and sign in. Invite Bhavik (Tailscale admin › Users › Invite); Bhavik installs
   Tailscale on their laptop or phone and accepts.
2. In Tailscale admin › DNS, turn on **MagicDNS** and **HTTPS certificates**.
3. Add your laptop's Tailscale name to the dashboard's allowed names. Open PowerShell in the str-qc folder:
   `setx QC_ALLOWED_HOSTS "your-laptop.<tailnet>.ts.net"`, then close and reopen the window.
4. Start the dashboard as usual, then in a second window run: `tailscale serve --bg 3000`.
5. Bhavik opens `https://your-laptop.<tailnet>.ts.net`. Bhavik can read every page; Import and Refresh only work on
   your laptop (from 127.0.0.1).

## B. Always on, with Docker

The container holds code only. At start it downloads `vault/data.qcvault` (encrypted) from the private GitHub repository
with a **read-only** token, unlocks it inside the container, and checks for a newer saved copy every 10 minutes.

1. On the always-on machine install Docker and copy this repository there (`git clone`).
2. Create three secret files in `deploy/secrets/` (the folder is ignored by git; on Linux run `chmod 600` on them):
   - `github_token`: GitHub › Settings › Developer settings › Fine-grained tokens › new token, only repository
     `str-qc`, permission **Contents: Read-only**, expiry 90 days. Nothing else.
   - `qc_passphrase`: the data passphrase you type for "Save data to GitHub".
   - `ts_authkey`: Tailscale admin › Settings › Keys › Generate auth key (reusable off, tag optional).
3. In `docker-compose.yml`, replace `<tailnet>` in `QC_ALLOWED_HOSTS` with your tailnet name (Tailscale admin › DNS).
4. Run `docker compose up -d --build`. After a minute, open `https://county-qc.<tailnet>.ts.net` from any device on the tailnet.
5. Daily: import on your laptop as now, then **Save data to GitHub**. The shared copy shows the new data within 10 minutes.

## What protects the data

- **No public address.** Only devices signed in to your tailnet can reach it; Tailscale encrypts every connection (WireGuard).
- **Allowed names only.** The dashboard refuses any request whose host is not 127.0.0.1, localhost or a name in
  `QC_ALLOWED_HOSTS`, so another website cannot read it through the browser.
- **Read-only copy.** The shared copy refuses every import or change (`QC_READ_ONLY=1`); writes on the laptop are
  accepted only from 127.0.0.1 with the dashboard's own header.
- **Encrypted in transit and on GitHub.** GitHub only stores the vault (AES-256-GCM); the token can only read that repository.
- **Locked-down container.** Runs as a normal user, read-only file system except its data folder, no extra privileges.
- **The trade-off of option B:** the always-on machine keeps the passphrase in a secret file so it can unlock the data
  by itself, and the unlocked data sits on that machine's disk. Use a machine only you control, with disk encryption
  on (BitLocker or the cloud provider's encrypted disk). To cut access at once: revoke the GitHub token, remove the
  device in Tailscale, or change the passphrase with `node scripts/vault.mjs save data --new-passphrase`.

## Why not Kubernetes

Two people read one dashboard. Kubernetes would add a cluster to patch, more credentials and more ways in, with nothing
gained at this size. One Docker container behind Tailscale is simpler and safer. If many more people need it later, the
same image runs on any container host.

## Automating the downloads later, without risk to your Google account

The safe route is a Google Ads **Script** (Tools › Bulk actions › Scripts) that runs inside Google Ads under your account
and writes the reports to a County-owned Google Sheet. It needs no password or API key stored anywhere, and you can stop
it with one click. `ads-script/County_Search_QC_Feed.js` already does this; connecting its sheet to this dashboard is the
next step. Never give any tool your Google password.
