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

Both need a free Tailscale account (yours). Create it yourself at tailscale.com; the dashboard never asks for or stores
Google or Tailscale passwords. **Share only the dashboard machine with Bhavik** (Tailscale admin › Machines › the machine ›
⋯ › Share): Bhavik signs in to their own free Tailscale account and sees that one machine, not your laptop or anything
else on your tailnet. Do not invite Bhavik as a user of your tailnet: by default every user of a tailnet can reach every
machine on it.

## A. From your laptop

1. Install Tailscale on the laptop and sign in. Share the laptop with Bhavik (see above); Bhavik installs Tailscale on
   their laptop or phone and accepts. Note: sharing the laptop shares every service it offers on Tailscale, which is
   one more reason to prefer B.
2. In Tailscale admin › DNS, turn on **MagicDNS** and **HTTPS certificates**.
3. Add your laptop's Tailscale name to the dashboard's allowed names. Open PowerShell in the str-qc folder:
   `setx QC_ALLOWED_HOSTS "your-laptop.<tailnet>.ts.net"`, then close and reopen the window.
4. Start the dashboard as usual, then in a second window run: `tailscale serve --bg 3000`.
5. Bhavik opens `https://your-laptop.<tailnet>.ts.net`. Bhavik can read every page; Import and Refresh only work on
   your laptop (from 127.0.0.1).

## B. Always on, with Docker

The container holds code only. At start it downloads `vault/data.qcvault` (encrypted) from the private GitHub repository
with a **read-only** token, unlocks it inside the container, and checks for a newer saved copy every 10 minutes.

**Before you start, on the laptop:** run **Save data to GitHub** once, so the code and the latest data are on GitHub.

1. **The machine.** An office PC that stays on (see **Office PC** below: Docker runs inside Ubuntu there) or a small Linux
   cloud server with an encrypted disk. Install Docker and Git, then `git clone https://github.com/abhay-tech1651/str-qc.git` and open
   the `str-qc` folder. Use your own GitHub sign-in for the clone, not the token below.
2. **Tailscale.** In Tailscale admin › DNS turn on **MagicDNS** and **HTTPS certificates**. Note the tailnet name shown
   there (for example `tail1234ab.ts.net`). In Settings › Keys, generate an **auth key** (not reusable, not ephemeral).
3. **GitHub token.** GitHub › Settings › Developer settings › Fine-grained tokens › Generate new token: repository access
   **only str-qc**, permission **Contents: Read-only**, nothing else, expiry 90 days. Put a reminder in your calendar.
4. **Setup.** In the str-qc folder run `powershell -ExecutionPolicy Bypass -File deploy\setup.ps1` (Windows) or
   `sh deploy/setup.sh` (Linux). It asks for the tailnet name, the token, the data passphrase (twice) and the auth key,
   hides what you type, and writes them to `.env` and `deploy/secrets/` (both ignored by git), readable by you only.
5. **Start.** `docker compose up -d --build`, then `docker compose logs -f qc` until it says **data updated**. If it says
   *GitHub refused the token* or *could not unlock*, run the setup again with the right value.
6. **Share.** Open `https://county-qc.<tailnet>.ts.net` yourself first. Then Tailscale admin › Machines › **county-qc** ›
   ⋯ › **Share**, and send Bhavik the invite link. Bhavik installs Tailscale, accepts, and opens the same address.
7. **Daily.** Import on your laptop as now, then **Save data to GitHub**. The shared copy shows it within 10 minutes.
   After a code update: `git pull` and `docker compose up -d --build` on the machine.

### Office PC (Windows)

**Use the free route: Docker Engine inside Ubuntu on WSL 2.** Docker Desktop needs a paid subscription at any company
with 250 or more employees or $10 million or more in yearly revenue (docs.docker.com, Docker Desktop license). Docker
Engine is open source (Apache 2.0) and costs nothing. Everything below runs on the office PC.

1. **Check the PC.** Copy the str-qc folder there or download `deploy/office-pc-check.ps1` alone, open PowerShell **as
   administrator** and run `powershell -ExecutionPolicy Bypass -File deploy\office-pc-check.ps1`. It only reads settings and
   prints no names or secrets, so you can paste the result to Claude. Fix every **[needs]** line:
   - **Disk encryption on.** Windows Pro: BitLocker. Windows Home has no BitLocker: turn on Settings › Privacy & security ›
     Device encryption if it is listed, otherwise use a Pro PC. Keep the recovery key away from the PC.
   - **Never sleep when plugged in** (Settings › System › Power). The screen may turn off; the PC must not sleep.
   - **Windows Update active hours** set to office hours, so restarts happen at night.
2. **Ubuntu.** As administrator: `wsl --install -d Ubuntu-24.04`, restart, open Ubuntu from the Start menu and create
   its user name and password (that password stays on the PC; nobody else needs it).
3. **Docker Engine and Git**, in the Ubuntu window (Docker's own instructions for Ubuntu):
   ```sh
   sudo apt-get update && sudo apt-get install -y ca-certificates curl git
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker "$USER"
   ```
   Close Ubuntu and open it again, then `docker run --rm hello-world` should print *Hello from Docker!*.
4. **The dashboard code**, in Ubuntu: `git clone https://github.com/abhay-tech1651/str-qc.git && cd str-qc`.
   Keep it inside Ubuntu (`~/str-qc`), not under `/mnt/c`, so the secret files keep owner-only permissions.
5. **Setup and start**, in Ubuntu in `~/str-qc`: `sh deploy/setup.sh`, then `docker compose up -d --build`, then
   `docker compose logs -f qc` until it says **data updated** (steps 4 and 5 above).
6. **Stay on after a restart.** In Windows PowerShell as administrator, in a copy of the str-qc folder:
   `powershell -ExecutionPolicy Bypass -File deploy\office-pc-autostart.ps1`. It adds one scheduled task that starts Ubuntu
   hidden each time you sign in; Docker then restarts the dashboard by itself. Leave the PC signed in and locked
   (Windows key + L). After a restart someone must sign in once. Test it: restart, sign in, lock, open the dashboard
   from your phone.
7. **Share** the county-qc machine with Bhavik (step 6 above).

Updating the code later, in Ubuntu: `cd ~/str-qc && git pull && docker compose up -d --build`.

## What protects the data

- **No public address.** Only your devices and the people you shared the machine with can reach it; Tailscale encrypts
  every connection (WireGuard). Remove a share in Tailscale admin and access ends at once.
- **Allowed names only.** The dashboard refuses any request whose host is not 127.0.0.1, localhost or a name in
  `QC_ALLOWED_HOSTS`, so another website cannot read it through the browser.
- **Read-only copy.** The shared copy refuses every import or change (`QC_READ_ONLY=1`); writes on the laptop are
  accepted only from 127.0.0.1 with the dashboard's own header.
- **Encrypted in transit and on GitHub.** GitHub only stores the vault (AES-256-GCM); the token can only read that repository.
- **Locked-down container.** Runs as a normal user, read-only file system except its data folder, no extra privileges.
- **The trade-off of option B:** the always-on machine keeps the passphrase in a secret file so it can unlock the data
  by itself, and the unlocked data sits on that machine's disk. Use a machine only you control, with disk encryption
  on (BitLocker or the cloud provider's encrypted disk). To cut access at once: remove the share or the machine in
  Tailscale, revoke the GitHub token, or change the passphrase with `node scripts/vault.mjs save data --new-passphrase`
  (the shared copy then stops updating until you run the setup there again).

## Why not Kubernetes

Two people read one dashboard. Kubernetes would add a cluster to patch, more credentials and more ways in, with nothing
gained at this size. One Docker container behind Tailscale is simpler and safer. If many more people need it later, the
same image runs on any container host.

## Automating the downloads later, without risk to your Google account

The safe route is a Google Ads **Script** (Tools › Bulk actions › Scripts) that runs inside Google Ads under your account
and writes the reports to a County-owned Google Sheet. It needs no password or API key stored anywhere, and you can stop
it with one click. `ads-script/County_Search_QC_Feed.js` already does this; connecting its sheet to this dashboard is the
next step. Never give any tool your Google password.
