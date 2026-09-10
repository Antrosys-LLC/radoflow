# The three terminals: check-in, check-out, and the kitchen

What is on the wall, what each one is for, and what to type into it.

| Terminal              | Serial          | IP              | MAC                 | What a scan means                     |
| --------------------- | --------------- | --------------- | ------------------- | ------------------------------------- |
| Main Gate — Check In  | `QWC5254900090` | `192.168.1.201` | `00:17:61:12:16:9C` | Always an arrival                     |
| Main Gate — Check Out | `QWC5261300506` | `192.168.1.202` | `00:17:61:10:C2:74` | Always a departure                    |
| Kitchen — Meals       | `QWC5261300445` | `192.168.1.203` | `00:17:61:10:C1:8A` | A meal, once per person per 24 hours |

All three are registered in RadoFlow already — serial, direction and purpose
are in the migration, not typed into a form, so a mistyped serial cannot make
one of them silently invisible.

---

## Two settings you gave that have to change

**The gateway cannot be `0.0.0.0`.** That is the single most common reason a
terminal looks perfectly configured and never delivers a punch. With no
gateway the device can reach other machines on the factory LAN and nothing
beyond it — so it can never reach the VPS, and it will sit there showing a
healthy screen while the day's attendance piles up in its buffer.

Set **Gateway** to the factory router, almost certainly `192.168.1.1`.

**The addresses you wrote were `192.186.1.x`.** Confirmed as `192.168.1.x`;
the table above is what to enter.

---

## Step 1 — What to set on each terminal

**Menu → Comm. → Ethernet** — the same on all three except the address:

| Setting     | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| DHCP        | **OFF**                                                     |
| IP Address  | `192.168.1.201` / `.202` / `.203`                           |
| Subnet Mask | `255.255.255.0`                                             |
| **Gateway** | **`192.168.1.1`** — not `0.0.0.0`                           |
| DNS         | `8.8.8.8`                                                   |

**Menu → Comm. → Cloud Server Setting** — identical on all three:

| Setting             | Value              |
| ------------------- | ------------------ |
| Server Mode         | `ADMS`             |
| Enable Domain Name  | **OFF**            |
| Server Address      | `148.230.66.172`   |
| Server Port         | `8080`             |
| Enable Proxy Server | OFF                |

`Enable Domain Name` must be off because you are entering an IP — that numeric
-only field is now exactly what you want.

TCP Comm Port stays `4370`. Nothing in this setup dials into the terminals, so
it only matters if you later run the on-site agent as well.

Save and **reboot each terminal.**

---

## Step 2 — The relay on the VPS

The terminals speak plain HTTP to a numeric address, which is why the VPS
exists at all; the reasoning is in [MB460-PUSH-VPS.md](MB460-PUSH-VPS.md).

**No relay code change was needed for any of this.** `scripts/rado-relay.mjs`
forwards everything under `/iclock/`, and the user-sync work added no new
paths — it filled in two endpoints (`/iclock/getrequest` and
`/iclock/devicecmd`) that the relay was already passing through and the server
was answering with a bare `OK`.

Redeploy it as it stands:

```bash
sudo systemctl stop rado-relay
sudo cp rado-relay.mjs /opt/radoflow/rado-relay.mjs
```

Then check the four settings in `/etc/radoflow-relay.env`:

```bash
sudo tee /etc/radoflow-relay.env >/dev/null <<'EOF'
RELAY_UPSTREAM=https://radoflow-production.up.railway.app
RELAY_SECRET=<the same value as DEVICE_INGEST_SECRET on Railway>
RELAY_PORT=8080
RELAY_ALLOWED_IPS=<the factory's PUBLIC ip>
EOF
sudo chmod 600 /etc/radoflow-relay.env
sudo systemctl start rado-relay
```

`RELAY_ALLOWED_IPS` is the factory's **public** address — what
`ifconfig.me` reports from a machine on the factory network. It is not
`192.168.1.x`; a LAN address there matches nothing and blocks every punch.

Confirm the port is open only to the factory:

```bash
sudo ufw allow 22/tcp
sudo ufw allow from <factory public ip> to any port 8080 proto tcp
sudo ufw enable
```

### Turn the command poll up while you set this up

The terminals collect queued work on their `getrequest` poll, whose interval
comes from `Delay` in the handshake — currently 10 seconds
(`src/lib/devices/zkteco/iclock.ts`). That is the longest a new enrolment can
take to reach the other two boxes.

---

## Step 3 — Check it is working

Watch the relay while somebody scans:

```bash
sudo journalctl -u rado-relay -f
```

Then open **Biometric Devices** in RadoFlow. Each terminal should show
*online* with a fresh heartbeat, and each has a **Roster on this terminal**
panel with four counters:

- **Waiting to be collected** — queued, the terminal has not asked yet
- **Handed over** — collected, no result reported back yet
- **Confirmed by the terminal** — it applied the instruction
- **Refused by the terminal** — it rejected one, almost always because it has
  no room left for more fingerprints

A healthy terminal sits at zero waiting and zero refused.

---

## How the three stay identical

Enrol a worker on **any** terminal and the other two get them within a poll.
The same is true of a deletion. Nothing has to be done in the office for this
to happen, and no button has to be pressed.

What makes that work:

- **One enrolment number per person, everywhere.** `profiles.device_pin`, the
  digits of their employee code — `RD-2070` becomes `2070`. A terminal stores
  the user id as a number and silently truncates anything else, which is how a
  previous round of punches went missing (`scripts/fix-terminal-ids.ts`).
- **RadoFlow holds the master copy of every fingerprint.** A terminal is a
  replica. That is what makes a replaced box recoverable without re-scanning
  four hundred fingers — press **Send every worker to this terminal**.
- **Templates are replayed byte for byte**, in whichever dialect the enrolling
  terminal spoke. Nothing re-encodes them.

### What a deletion at a terminal does and does not do

Deleting somebody on a terminal removes them from **all three**, and clears
their fingerprints from RadoFlow so a later resync cannot quietly restore
their access.

It does **not** delete the person. Their attendance and any unpaid payroll
line are records of work that happened, and a supervisor pressing DELETE on a
wall-mounted box — which asks for no confirmation — is not a decision about
somebody's employment. Marking them terminated stays an office action.

> **Worth deciding on separately:** marking somebody *terminated* or
> *suspended* in RadoFlow does not currently pull them off the terminals, so
> they can still open the gate until somebody deletes them on a device. The
> resync button already excludes non-active staff, so a rebuilt terminal drops
> them — but nothing removes them from a terminal that is already running. Say
> the word and that becomes automatic.

---

## When somebody is enrolled who is not in RadoFlow yet

Normal on a new worker's first morning: the gate supervisor enrols them before
the office has entered them.

The three terminals still converge — RadoFlow relays the user and their
fingerprints to the other two — but there is nobody to attach the scan to, so
nothing is stored centrally and their punches are recorded ownerless. The
server log names the PIN:

```
[iclock] QWC5254900090: 1 PIN(s) not in RadoFlow: 1043
```

Create the person with employee code `RD-1043` and it resolves itself: the
number is derived on save, a proper record is pushed to all three, and the
punches they already made are attributed to them.

---

## If something is wrong

| Symptom                                         | Cause                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Terminal shows offline, nothing in the relay log | Gateway is `0.0.0.0`, or the factory's public IP is not in `RELAY_ALLOWED_IPS`               |
| Relay logs `401`                                 | `RELAY_SECRET` and `DEVICE_INGEST_SECRET` differ                                            |
| Relay logs `404 Unknown device`                  | The serial on the device does not match the one registered — check **Menu → System Info**  |
| Punches arrive with no name against them        | That PIN has no person in RadoFlow (see above)                                              |
| **Refused by the terminal** climbing            | The terminal is out of fingerprint memory                                                   |
| Waiting-to-be-collected climbing, nothing moving | The terminal is not polling — check it is online and that `/iclock/getrequest` reaches you |

A failed upload is never acknowledged as a success. An ADMS terminal deletes
its copy of a batch the moment it is told `OK`, so anything else would lose
attendance permanently.
