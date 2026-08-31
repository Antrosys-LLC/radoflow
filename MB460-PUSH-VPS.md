# MB460 push to a live SaaS, via a VPS with a static IP

This is the setup where the terminal pushes punches **the moment they happen**,
with no software on the factory network.

## Why a VPS is needed at all

The MB460 has ADMS (_Cloud Server Setting_), so it can push. But three firmware
facts have to be satisfied at once, and a platform like Railway satisfies none
of them:

| The terminal needs                                                    | Railway gives you                       |
| --------------------------------------------------------------------- | --------------------------------------- |
| A **fixed address** it can reach                                      | A domain on shared edge IPs that change |
| That address as **digits** — the Server Address field is numeric-only | A hostname                              |
| Usually **plain HTTP**; most ZKTeco ADMS builds have no TLS           | HTTPS only                              |

A VPS fixes all three. Every Hostinger VPS plan includes a dedicated static
IPv4 — that is the piece Railway cannot provide.

```
MB460  ──HTTP──►  VPS static IP  ──HTTPS──►  Railway
       numeric address    relay adds secret      /iclock/cdata
```

The terminal only ever speaks plain HTTP to a numeric address. The relay does
the TLS and the authentication.

**The secret never goes on the terminal.** The device sends nothing
confidential; the relay attaches `DEVICE_INGEST_SECRET` on the way out. A
terminal on a factory wall, which anyone can open the menu on, is not a good
place to keep a key.

---

## Step 1 — Get the VPS

Any Hostinger VPS plan works; the smallest is ample — this relay forwards a few
hundred bytes per punch. During setup:

- Choose **Ubuntu 24.04**.
- After provisioning, note the **IPv4 address** shown in hPanel. That number is
  what you type into the terminal.

Confirm it is static: Hostinger VPS IPv4 addresses are dedicated and stay with
the instance for its lifetime. Do not use a shared-hosting plan — those have no
dedicated IP and cannot listen on a custom port.

---

## Step 2 — Install the relay on the VPS

SSH in, then:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo mkdir -p /opt/radoflow && sudo chown $USER /opt/radoflow
```

Copy `scripts/rado-relay.mjs` to `/opt/radoflow/`.

### The four settings

| Setting             | What to put                                                                     | Where it comes from                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `RELAY_UPSTREAM`    | Your Railway public URL, e.g. `https://radoflow-production-a1b2.up.railway.app` | Railway → your service → **Settings → Networking → Public Networking**. Origin only — no trailing slash, no path              |
| `RELAY_SECRET`      | A long random string                                                            | Generate with `openssl rand -hex 32`. Must be **identical** to `DEVICE_INGEST_SECRET` on Railway, or every push returns `401` |
| `RELAY_PORT`        | `8080`                                                                          | Keep unless the port is taken. Must match the terminal's _Server Port_ and your firewall rule                                 |
| `RELAY_ALLOWED_IPS` | The factory's **public** IP, e.g. `39.51.204.118`                               | Browse to `ifconfig.me` from a machine **on the factory network**                                                             |

> **The common mistake:** `RELAY_ALLOWED_IPS` is the factory's _public_ address —
> what the internet sees the router as. It is **not** `192.168.1.202` or any
> other `192.168.x.x` address. A LAN address there matches nothing and silently
> blocks every punch.

Put the values in a root-only file rather than the unit itself — unit files in
`/etc/systemd/system` are world-readable, and this secret can write attendance,
which feeds payroll:

```bash
sudo tee /etc/radoflow-relay.env >/dev/null <<'EOF'
RELAY_UPSTREAM=https://radoflow-production-a1b2.up.railway.app
RELAY_SECRET=paste-the-same-secret-as-railway
RELAY_PORT=8080
RELAY_ALLOWED_IPS=39.51.204.118
EOF
sudo chmod 600 /etc/radoflow-relay.env
```

Create `/etc/systemd/system/rado-relay.service`:

```ini
[Unit]
Description=RadoFlow ADMS relay
After=network-online.target

[Service]
ExecStart=/usr/bin/node /opt/radoflow/rado-relay.mjs
Restart=always
RestartSec=5
EnvironmentFile=/etc/radoflow-relay.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rado-relay
sudo systemctl status rado-relay
```

### Lock the port down

Find the factory's public IP by browsing to `ifconfig.me` from any machine
**on the factory network**, then:

```bash
sudo ufw allow 22/tcp
sudo ufw allow from YOUR_FACTORY_PUBLIC_IP to any port 8080 proto tcp
sudo ufw enable
```

`RELAY_ALLOWED_IPS` enforces the same rule inside the relay, so it holds even
if the firewall is later flushed. Both matter: the traffic is plain HTTP, and
anyone who can reach that port can write attendance, which feeds payroll.

> If the factory has a dynamic public IP, the allowlist will break when it
> changes. Either ask the ISP for a static IP, or drop the allowlist and rely
> on the relay path being unguessable — weaker, and worth knowing you chose it.

**Verify from your own machine:**

```bash
curl http://YOUR_VPS_IP:8080/health
```

Expect `relay ok`. If it hangs, the firewall is blocking you — which is correct
if you set an allowlist and are not on the factory network.

---

## Step 3 — Configure the MB460

**Menu → Comm. → Ethernet** — the terminal now needs real internet access,
which it does not have with a `0.0.0.0` gateway:

| Setting     | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| DHCP        | **OFF**                                                            |
| IP Address  | `192.168.1.202`                                                    |
| Subnet Mask | `255.255.255.0`                                                    |
| **Gateway** | **`192.168.1.1`** — required; `0.0.0.0` leaves it stuck on the LAN |
| **DNS**     | `8.8.8.8` — harmless, and needed if you ever switch to a domain    |

**Menu → Comm. → Cloud Server Setting**

| Setting                | Value                                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| Server Mode            | `ADMS`                                                                  |
| **Enable Domain Name** | **OFF** — you are using an IP, so the numeric-only field is now correct |
| Server Address         | your VPS IPv4, e.g. `203.0.113.45`                                      |
| Server Port            | `8080`                                                                  |
| Enable Proxy Server    | OFF                                                                     |

Save and **reboot the terminal**.

That numeric-only field you ran into is no longer a problem — with this design
an IP is exactly what you want to enter.

---

## Step 4 — Register the terminal in RadoFlow

**Biometric Devices → Add terminal**:

- **Serial number** — exactly what _Menu → System Info_ shows. The device sends
  it as `?SN=` on every request, and RadoFlow rejects an unknown serial.
- **Mode** — Push.
- IP address and COMM KEY are not used in push mode; fill them only if you also
  want to poll the device from the factory LAN.

---

## Step 5 — Confirm punches are arriving

Watch the relay while someone scans a finger:

```bash
sudo journalctl -u rado-relay -f
```

A successful push logs:

```
[22/08/2026, 8:03:11 am] 203.0.113.9 → 200 OK: 1
```

Then check **Biometric Devices** in RadoFlow — the terminal should show
_online_ with a fresh heartbeat, and the punch on the device page.

---

## What happens when things break

| Situation                      | Behaviour                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Railway is down or redeploying | Relay returns `502`, the terminal keeps the batch and retries. No punches lost.        |
| VPS reboots                    | systemd restarts the relay; the terminal retries in the meantime.                      |
| Wrong secret                   | Upstream returns `401`, relay passes it through, terminal retries. Fix `RELAY_SECRET`. |
| Serial not registered          | Upstream returns `500`; add the terminal in RadoFlow.                                  |

The relay never converts a failure into a success. An ADMS terminal that
receives `OK` deletes its copy of the batch, so acknowledging a request that
did not actually store anything would lose attendance permanently.

---

## Do you still need Railway?

If you are paying for a VPS anyway, you can run RadoFlow itself on it and drop
Railway entirely — one bill, one machine, and the terminal pushes straight to
the app with no relay. You would take on OS updates, TLS certificates and
restarts yourself, which is what Railway is doing for you today.

Keep both if you want Railway's deploys and rollbacks; the relay is small and
costs one process on the cheapest VPS tier.

---

## The alternative, for comparison

The on-site agent (see [TERMINALS-SETUP.md](TERMINALS-SETUP.md)) needs no VPS
and no static IP at all — a PC inside the factory polls the terminals and posts
outward. Trade-offs:

|                    | VPS relay (push)    | On-site agent (pull)                  |
| ------------------ | ------------------- | ------------------------------------- |
| Punches appear     | Instantly           | Within the poll interval, default 60s |
| Extra cost         | A VPS               | None, if a PC is already on           |
| Needs a static IP  | Yes                 | No                                    |
| Works with the K50 | No — it has no ADMS | Yes                                   |
| Runs where         | The VPS             | A factory PC                          |

Because the **K50 cannot push at all**, running the agent is unavoidable if you
want that terminal included. In that case the agent can cover the MB460 too,
and the VPS becomes optional.
