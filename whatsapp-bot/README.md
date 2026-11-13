# RadoFlow WhatsApp bot

Ask RadoFlow questions and get its reports in WhatsApp, free. A small program
logs in to WhatsApp as a **linked device on a spare number**, and forwards what
people type to RadoFlow. RadoFlow works out who is asking from their phone number
and answers only what that person is allowed to see.

> **Unofficial.** This uses WhatsApp Web's protocol through the Baileys library,
> which WhatsApp's terms do not allow. The number can be banned. Use a dedicated
> SIM — never an owner's own number — and keep the bot quiet: it only ever
> replies to a command, it never messages anyone first.

## What people can type

In a **group**, start with `!` or `rado` so ordinary chat is ignored. In a
**private chat** with the bot, just type.

| Message                                         | Answer                                                        |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `!attendance`                                   | In / absent / late today, by department                       |
| `!attendance dyeing yesterday`                  | One department, one day                                       |
| `!checkins dyeing`                              | Each person's in and out time in that department              |
| `!canteen 13-11-2026`                           | Meals served that day                                         |
| `!report dyeing`                                | The check-in/out file, PDF and Excel                          |
| `!report dyeing 01-11-2026 to 07-11-2026 excel` | A range, one format                                           |
| `!report till now`                              | Everyone, from the 1st until this moment                      |
| `!payroll`                                      | Latest pay run and its salary register (private/payroll only) |
| `!help`                                         | The list                                                      |

## Who may ask

- A person must have **their phone number on their RadoFlow profile** (Users
  screen). Any format works (`0300-1234567`, `+92 300 1234567`). An unknown
  number is told to ask the office, and nothing else.
- Every command is checked against that person's **own permissions** — the same
  ones the website uses. A manager who cannot open Payroll cannot get it here.
- **Pay never goes to a general group.** Salary figures and registers are sent
  only in a private chat or in a group whose id is listed in
  `BOT_PAYROLL_GROUPS`. Type `!id` in a group to get its id.

## Set up

1. **Database.** Apply `supabase/migrations/20261113090000_bot_permissions.sql`
   (it adds one function the bot's permission check uses, callable by the
   service role only).
2. **RadoFlow.** Set `BOT_SECRET` (16+ characters, e.g. `openssl rand -hex 32`)
   in the RadoFlow server's environment and restart it.
3. **The bot, on the VPS** (Node 20 or newer):

   ```bash
   cd whatsapp-bot
   npm install
   cp .env.example .env     # fill in RADO_URL, BOT_SECRET, BOT_PAYROLL_GROUPS
   node index.mjs
   ```

4. **Link the number.** A QR code prints in the terminal. On the spare phone:
   WhatsApp → Linked devices → Link a device → scan. Add that number to the
   groups.
5. **Keep it running** with pm2 (`pm2 start index.mjs --name rado-bot`,
   `pm2 save`, `pm2 startup`) or a systemd service.

## Looking after it

- **Back up `auth/`.** It is the bot's login. Lose it and you scan the QR again;
  leak it and someone else _is_ the bot's number. It is git-ignored.
- Open WhatsApp on the spare phone every week or two, or WhatsApp unlinks the
  device.
- If the bot is logged out, delete `auth/` and scan again.
- WhatsApp sometimes hides a group member's number behind an anonymous id. The
  bot then asks that person to message it privately once.
