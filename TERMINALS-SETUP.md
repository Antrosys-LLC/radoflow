# Connecting ZKTeco terminals to a live RadoFlow

Covers the **K50** and the **MB460**. Both speak the same protocol on TCP
`4370`, so one agent handles both.

## Why the on-site agent, for both terminals

Your terminals sit on the factory LAN at `192.168.1.x`. That is a **private**
address — a server on a public domain cannot dial it. So the factory side has
to reach out, never the other way around.

Two device-specific reasons this is the only reliable route:

- **K50** — its Comm menu has only *Ethernet* and *PC Connection*. No ADMS, so
  it cannot upload anywhere. It only answers when something asks.
- **MB460** — it *does* have *Cloud Server Setting*, but pointing it at a
  Railway deployment does not work. Railway gives you a **domain**, served from
  shared edge IPs that change without notice. A device needs a fixed address:
  a hardcoded IP will eventually stop being yours, and a domain needs both the
  text-input field and the HTTPS support that many ZKTeco builds lack.

> **"Enable Domain Name" still only accepts numbers?** Look for the input-mode
> toggle on the on-screen keyboard (usually `123` / `ABC`, sometimes a globe or
> keyboard icon), then save and reboot — on several firmwares the field only
> changes type after a restart. But this is not actually the blocker for
> Railway; the missing static IP is.

Two things this arrangement makes easier:

- Gateway and DNS barely matter. The terminals never need the internet — only
  the agent PC does, and that is an ordinary machine.
- Nothing is opened inbound. The agent makes outbound connections only, so no
  port forwarding and no firewall rule at the factory.

---

## Step 1 — Configure the terminal

Do this on **each** device. Everything needed is on one screen.

**Menu → Comm. → Ethernet**

| Setting | K50 | MB460 | Why |
| --- | --- | --- | --- |
| **DHCP** | **OFF** | **OFF** | The most important one. On DHCP the router can hand out a different address after a power cut, and the agent then talks to nothing. |
| IP Address | `192.168.1.201` | `192.168.1.202` | Must be unique, and on the same subnet as the agent PC |
| Subnet Mask | `255.255.255.0` | `255.255.255.0` | |
| Gateway | `192.168.1.1` | `192.168.1.1` | `0.0.0.0` also works — see below |
| DNS | `0.0.0.0` | `0.0.0.0` | Not used; the terminals never resolve names |
| TCP COMM Port | `4370` | `4370` | The port the agent connects to |

**On the Gateway.** With `0.0.0.0` a terminal can still reach anything on
`192.168.1.x`, which includes the agent PC — so that setting works. Setting it
to `192.168.1.1` costs nothing and keeps working if the agent later moves to
another subnet. Either is fine; DHCP is what actually matters.

**Reserve both addresses on your router.** A static IP on the terminal does not
stop the router leasing that same address to a laptop. An address clash looks
exactly like a dead terminal.

**Menu → Comm. → PC Connection** — note the **Comm Key**. If it shows `0` or
blank, leave the COMM KEY field empty in RadoFlow. Your K50 accepts the
connection with key `0`, so in all likelihood you never need this screen.

**Menu → System Info** — write down the **Serial Number** of each device,
exactly as displayed.

### Cabling

- **Through the router or a switch** (what you have): each terminal by Ethernet
  cable into the same network as the agent PC. The PC may be on Wi-Fi — the
  router bridges them, so long as everything is on `192.168.1.x`.
- **Cable straight from PC to terminal**: also fine for a single device. Give
  the PC a static address on the same subnet and leave the gateway blank.
  Modern network cards auto-detect, so an ordinary straight cable works.

### Prove the network before going further

From the agent PC:

```bash
Test-NetConnection 192.168.1.201 -Port 4370
```

`TcpTestSucceeded : True` is what you want. `PingSucceeded : False` is normal
and harmless — ZKTeco terminals ignore ping but answer on 4370.

If the port test fails: the terminal is powered off, on a different subnet, or
its address has been taken by another device.

---

## Step 2 — Register each terminal in RadoFlow

Sign in as Admin or CEO, then **Biometric Devices → Add terminal**, once per
device.

| Field | Value |
| --- | --- |
| Terminal name | e.g. `Dyeing — main gate` |
| Factory | the site it belongs to |
| Serial number | exactly what *System Info* showed |
| Model | `ZKTeco K50` or `ZKTeco MB460` |
| Connection mode | **Pull — we connect to the terminal over TCP** |
| IP address | `192.168.1.201` / `192.168.1.202` |
| Port | `4370` |
| COMM KEY | from *PC Connection*; leave blank if `0` |

---

## Step 3 — Set the shared secret on the server

Generate one and set it as `DEVICE_INGEST_SECRET` on your host (Railway → your
service → Variables):

```bash
openssl rand -hex 32
```

Leave `DEVICE_SYNC_ENABLED` unset on the Railway deployment — the cloud cannot
reach the terminals and must not try.

---

## Step 4 — Run the agent on a factory PC

Any always-on Windows PC or Raspberry Pi on the `192.168.1.x` network, with
Node 20 or newer. Copy `scripts/rado-agent.mjs` onto it.

**Check the setup before trusting it:**

```bash
RADO_URL=https://your-domain.com RADO_DEVICE_SECRET=your-secret RADO_DEVICES=K50-DYE-0001@192.168.1.201,MB460-0001@192.168.1.202 node rado-agent.mjs --check
```

This proves the whole chain and names anything wrong:

```
Server : https://your-domain.com
  ✓ reachable, secret accepted

Terminal K50-DYE-0001 at 192.168.1.201:4370
  ✓ connected
    firmware       Ver 6.60
    enrolled users 1
    stored records 9
    serial         K50-DYE-0001 (matches)

All checks passed. Run without --check to start syncing.
```

A serial mismatch is called out explicitly, because it is the failure that
otherwise looks like "everything is running but no attendance appears".

**Then run it for real** — drop `--check`.

`RADO_DEVICES` is `serial@ip[:port][#commKey]`, comma-separated:

```
K50-DYE-0001@192.168.1.201,MB460-0001@192.168.1.202#1234
```

| Variable | Default | Notes |
| --- | --- | --- |
| `RADO_INTERVAL_SECONDS` | `60` | How often to poll |
| `RADO_CLEAR_DEVICE_LOG` | `false` | Wipes the terminal log after upload. Leave off — the device keeps no backup |

Re-reading the same records is harmless: ingestion is idempotent, so a replay
stores nothing twice and cannot double-count anyone's hours.

---

## Step 5 — Keep it running

**Windows** — Task Scheduler → Create Task:

- *General*: **Run whether user is logged on or not**
- *Triggers*: **At startup**
- *Actions*: Program `node`, Arguments `C:\radoflow\rado-agent.mjs`, Start in
  the folder holding the script
- *Settings*: **If the task fails, restart every 1 minute**

Set the environment variables as System variables, or wrap the command in a
`.bat` that sets them first.

**Linux** — a systemd unit with `Restart=always` and `Environment=` lines.

---

## Employee IDs must match

The number enrolled on a terminal **is** the employee code in RadoFlow.
Creating a user with code `RD-1042` automatically creates the mapping for every
terminal at that factory, so enrol that worker on the device under PIN
`RD-1042` — not `1`.

If a terminal ID arrives that nobody owns, the device page shows *"N terminal
IDs not linked to anyone"*. The punches are still stored, and linking the ID
afterwards attributes them retroactively — nothing is lost.

> The K50 currently has one enrolment under ID `1`. Either re-enrol that finger
> under the person's employee code, or link ID `1` on the device page.

---

## Hours, shifts and lateness

Punches become hours automatically. Lateness is measured against the assigned
shift, after its grace period, in Pakistan time — a worker on Shift A (06:00,
10 min grace) checking in at 06:47 is 37 minutes late, landing in the 30–60
minute band and deducting 10% of one day's pay. Bands are editable under
**Pay Rates**.

If a terminal stamps every punch as a check-in — which the K50 does, having no
separate in/out keys — RadoFlow detects that and pairs punches in time order
instead (first in, next out). An odd number of punches is flagged for a
supervisor rather than guessed at.

---

## Security

- Keep the terminals on their own VLAN. The ZKTeco COMM KEY is obfuscation, not
  authentication — adjacent sessions derive the same token, so it cannot be
  relied on to protect punch data.
- `DEVICE_INGEST_SECRET` is what actually protects the ingest endpoint. Treat
  it as a password: anyone holding it can write attendance, which feeds
  straight into payroll.
- The endpoint refuses every request when the secret is unset, rather than
  running open.

---

## If you later use a terminal that can push

RadoFlow accepts ADMS uploads at `/iclock/cdata`. Set the terminal's Cloud
Server address to your domain and port; the firmware appends the path itself.
That needs a stable public address the device can reach, which a Railway domain
alone does not provide — so it suits a deployment with a fixed IP, or a small
relay on the factory LAN that forwards to Railway.
