# THANXIE AI — Personal WhatsApp Pairing Setup

THANXIE AI on this branch uses **Baileys** as the active WhatsApp transport. The bot links a normal WhatsApp account through WhatsApp Web-style pairing code and keeps the existing THANXIE command, registration, moderation, community, media, AI and SQLite layers as the application engine.

## Pair the personal WhatsApp number

Set:

```env
PAIRING_ADMIN_TOKEN=<long-random-secret>
BAILEYS_AUTH_DIR=./data/baileys-auth
```

Start the bot, then call the protected pairing endpoint:

```text
POST /pairing
Authorization: Bearer <PAIRING_ADMIN_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "phone_number": "+2637XXXXXXXX"
}
```

The response contains the temporary pairing code. On the phone, open WhatsApp → Linked devices → Link a device → enter the pairing code.

The bot stores the Baileys multi-file authentication state under `BAILEYS_AUTH_DIR`. The directory is ignored by Git and must never be committed or shared.

Do not send a WhatsApp account OTP, PIN, password or authentication-state files to the bot's API. The pairing endpoint is protected by the administrator bearer token.

## Conservative behavior safeguards

The transport includes a safety layer intended to reduce accidental spammy behavior and unnecessary account risk:

- global outbound message-per-minute limit;
- per-group outbound limit;
- per-user response limit;
- minimum delay between sends;
- duplicate-message suppression;
- bounded outbound queue;
- circuit breaker after selected authentication/rate-limit transport failures;
- exponential reconnect backoff;
- inbound duplicate-event suppression;
- no status/newsletter/broadcast event processing;
- full WhatsApp history sync disabled;
- online-presence marking disabled on connection;
- no bulk DM feature is added by the transport layer.

Default limits are intentionally conservative and can be changed with environment variables. These controls are engineering safeguards, **not a guarantee against WhatsApp restrictions or bans**.

## Environment policy

```env
WA_GLOBAL_MESSAGES_PER_MINUTE=30
WA_GROUP_MESSAGES_PER_MINUTE=10
WA_USER_MESSAGES_PER_MINUTE=6
WA_MIN_SEND_DELAY_MS=1800
WA_DUPLICATE_WINDOW_MS=120000
WA_INBOUND_DEDUP_WINDOW_MS=300000
WA_MAX_QUEUE=100
WA_CIRCUIT_BREAK_MS=60000
```

If the account receives a transport-level restriction, the circuit breaker pauses automated sends rather than repeatedly retrying. The bot also avoids aggressive reconnect loops.

## Existing THANXIE functionality

The application engine remains in place, including:

- command registry and menus;
- registration and Terms workflow;
- AI commands and multilingual personalization;
- group moderation and warning system;
- group welcome/farewell and membership statistics;
- Pino Pino features;
- premium controls;
- media processing;
- branding data and SQLite persistence;
- health/readiness endpoints.

The former Meta transport modules remain in the repository for compatibility with existing application services, but they are **not the active WhatsApp message transport on this branch**.

## Important limitation

Baileys is an unofficial WhatsApp Web automation library. Using a personal WhatsApp account for automation can carry account, service and policy risk. Rate limiting and conservative behavior can reduce unnecessary automation activity, but cannot make the account ban-proof or reproduce Meta's official business platform behavior.

## AI

Optional AI remains configured through the existing provider interface. The repository example uses Gemini:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=<key>
GEMINI_MODEL=gemini-2.5-flash-lite
```
