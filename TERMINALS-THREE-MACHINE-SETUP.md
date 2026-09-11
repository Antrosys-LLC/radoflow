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

## Two corrections to the settings as first written

**The gateway cannot be `0.0.0.0`.** That is the single most common reason a
terminal looks perfectly configured and never delivers a punch. With no
gateway the device can reach other machines on the factory LAN and nothing
beyond it — so it can never reach the VPS, and it will sit there showing a
healthy screen while the day's attendance piles up in its buffer.

Set **Gateway** to the factory router, almost certainly `192.168.1.1`.

**The addresses were written as `192.186.1.x`.** Confirmed as `192.168.1.x`;
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

### The quick way

`scripts/configure-relay.sh` does everything in this step: settings, service,
firewall, and a check that the VPS can reach Railway. From the repo on your PC:

```bash
scp scripts/rado-relay.mjs scripts/configure-relay.sh root@148.230.66.172:/opt/radoflow/
```

```bash
ssh root@148.230.66.172 "bash /opt/radoflow/configure-relay.sh"
```

It keeps the `RELAY_SECRET` already on the VPS rather than setting a new one,
and opens 80 and 443 before enabling the firewall so radofactory.online stays
up. The manual steps below are what it does.

### By hand

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
RELAY_ALLOWED_IPS=182.191.119.76
EOF
sudo chmod 600 /etc/radoflow-relay.env
sudo systemctl start rado-relay
```

`182.191.119.76` is the factory's public static IP — the address the VPS sees
the connection arriving from. It is not one of the `192.168.1.x` addresses
above; a LAN address there matches nothing and blocks every punch.

Because it is static, this allowlist will keep working. If the ISP ever moves
you onto a dynamic address, every punch stops the day it changes — check with
`curl ifconfig.me` from a machine on the factory network.

Confirm the port is open only to the factory:

```bash
sudo ufw allow 22/tcp
sudo ufw allow from 182.191.119.76 to any port 8080 proto tcp
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

### Suspending or terminating somebody in RadoFlow

Marking a person *suspended* or *terminated* withdraws them from all three
terminals straight away. Nothing has to be done at a device. Making them
*active* again puts them back, fingerprints and all — their templates are
kept through a suspension, so reinstating somebody is a status change rather
than a queue at the enrolment terminal.

The two are treated the same on the hardware. They mean different things to
the office and to payroll, but neither is somebody who should be opening the
gate this afternoon.

Nothing can push a non-active person to a terminal — not the resync button,
and not an edit to their name or employee code. That last one mattered: before
this, correcting the spelling of a terminated worker's name would have pushed
a fresh user record and handed them the gate back.

Anyone already marked terminated when this was deployed was withdrawn once, by
the migration.

---

## Nothing on a terminal is ever overwritten by another terminal

Each terminal is sent only what it does not already have. RadoFlow keeps an
inventory of every user and every finger on each box, and a finger a terminal
already holds is never sent to it again — even if another terminal has a
different scan of the same finger. The same goes for a user record copied from
another terminal.

Changes made in RadoFlow itself — a name, a terminal admin, a card — are the
exception, and do update the terminals.

## Merging the three rosters

Press **Merge every terminal's roster** on the Biometric Devices screen. Each
terminal's gaps are filled in a stated order of precedence:

1. The check-in gate's records go to the other two, wherever they are missing.
2. Then the check-out gate's, wherever still missing.
3. Then the kitchen's.

Nothing already on a terminal is replaced, suspended and terminated staff are
not copied, and running the merge again adds nothing. It only queues; each
terminal collects its share on its own poll, twelve at a time.

A terminal that has never reported its roster looks empty, and the merge will
send it everything. That is the right answer for a box that was replaced and
the wrong one for a box that simply is not talking — check it is collecting
work before reading a large number as progress.

### Administrators are the one thing a merge does overwrite

Everything else is additive, and for a supervisor that rule bites: a gate
holding PIN 1 as an ordinary user would keep a locked menu for ever, because
nothing is allowed to replace a record it already has. A terminal with no
administrator opens its menu to whoever presses the button.

So the merge ends by putting every administrator RadoFlow knows back at their
proper privilege on every terminal — using **that terminal's own record**, with
only the privilege changed. Names and cards are left exactly as each box has
them. This matters here: PIN 1 is the same person under two names, "UmarCEO" on
the check-in gate and "Antrosys" on the check-out gate, and neither is renamed.

The same correction happens on its own whenever a terminal uploads a roster
that has an administrator down as an ordinary user. Privilege is only ever
learned upward — a box saying somebody has less power than the office granted
them is reporting its own gap.

### Asking a terminal what it holds

A terminal reports a worker when somebody is enrolled and never again, so
RadoFlow's picture of a box is only as complete as the uploads it was listening
for at the time. When the parser learns a record type it did not know, whatever
is already on the wall stays invisible until the box is asked again:

```bash
node scripts/ask-terminal-for-roster.mjs --apply .201
```

It queues `DATA QUERY USERINFO` then `DATA QUERY FINGERTMP` — that order,
because a terminal discards a template for a PIN it has not been introduced to.
Despite the name, the second returns faces as well as fingerprints.

**This is the shape of the upload flood**: several hundred uploads over about
twelve minutes per terminal. Survivable now, but ask one box at a time and
watch it rather than setting it going and walking away.

### When the same man is on two terminals under two spellings

The gates were enrolled at different times by different people, so a worker
could be `MAJID SHAH` on one screen and `Majidshah` on the other. It changes
nothing about scanning — a terminal matches on the enrolment number — but it
makes two screens impossible to read against each other.

```bash
node scripts/fix-terminal-names.mjs
```

Dry by default; `--apply` queues the corrections. It rewrites `Name` only and
copies every other field from the record that terminal already holds, so a
card or a supervisor's privilege survives.

It splits what it finds in two, because they are not the same claim.
`Majidshah` and `MAJID SHAH` are one name typed twice, and those it will fix.
`Sameer` and `ZAMEER`, or `Ranaahsan` and `RANA HUSSAIN`, are two different
names — RadoFlow's comes from the workers list and the terminal's from whoever
enrolled him, and neither is automatically right. Those are printed and left
alone until somebody who knows the man says which is his, then
`--include-renames` applies them too.

PIN 1 and PIN 2 are never touched. They are one person under two names on
purpose.

## Pausing sync

If the terminals ever start trading far more instructions than expected, set
all three to **Pull** mode on the Biometric Devices screen. That stops every
copy and relay immediately with no deploy. Punches and meals keep recording.
Set them back to **Push** to resume.

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
