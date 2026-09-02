# THANXIE AI v3.0

THANXIE AI is a Node.js WhatsApp assistant built around the **official Meta WhatsApp Business Platform / Cloud API**.

**No Baileys. No WhatsApp Web automation. No QR pairing. No unofficial WhatsApp library.**

![THANXIE AI](assets/branding/thanxie-default.png)

## What is included

- 185 registered commands with dynamic menus
- AI chat and group question handling
- 8 languages: English, Shona, Ndebele, French, Portuguese, Spanish, Swahili and Zulu
- Registration workflow
- Group welcome/farewell workflows where Meta exposes the required events
- Moderation and warning system
- Community content tools
- Premium controls
- Media processing
- Centralized THANXIE AI branding
- `.setbotimage` branding workflow
- SQLite persistence
- Meta webhook verification and signature validation
- Immediate webhook acknowledgement so AI processing does not block Meta
- Docker deployment
- Health and readiness endpoints

## Project layout

```text
THANXIE-AI/
├── src/                    # application code
│   ├── commands/
│   ├── handlers/
│   ├── middleware/
│   ├── services/
│   ├── database/
│   └── locales/
├── config/                 # small static configuration
├── assets/branding/        # default THANXIE AI artwork
├── docs/
├── tests/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
└── package.json
```

The old `config/src/` nesting has been removed. `src/` is now the real application root.

## Requirements

- Node.js 22+
- npm 10+
- Meta WhatsApp Business Platform application
- Public HTTPS endpoint for the webhook

SQLite is provided by Node's built-in `node:sqlite` in the supported Node version; no separate SQLite server is required.

## 1. Install

```bash
npm install
```

## 2. Configure

Copy:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

At minimum configure:

```env
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
OWNER_WHATSAPP_ID=

WHATSAPP_CHANNEL_URL=
WHATSAPP_GROUP_URL=
REGISTRATION_GROUP_LINK=
```

Keep secrets only in `.env` or your hosting provider's secret manager. Never commit them.

## 3. Test the code

```bash
npm run check
npm test
```

The current test suite verifies the command registry, registration, moderation and media quota behavior.

## 4. Start

```bash
npm start
```

Health:

```text
GET /health
GET /ready
```

Webhook:

```text
GET /webhook
POST /webhook
```

## Simple Meta webhook setup

Use one public URL:

```text
https://YOUR-DOMAIN.example/webhook
```

In Meta:

1. Add your callback URL.
2. Enter the exact same `META_VERIFY_TOKEN` value from `.env`.
3. Verify the callback.
4. Subscribe the WhatsApp Business Account to the required webhook fields.
5. Make sure the deployment is publicly reachable over HTTPS.
6. Keep `META_APP_SECRET` configured in production so POST signatures are checked.

The webhook intentionally does very little:

```text
Meta
  ↓
GET /webhook
  ↓
verification

Meta
  ↓
POST /webhook
  ↓
validate signature
  ↓
return HTTP 200 immediately
  ↓
process event in background
```

This prevents slow AI/media/database work from delaying Meta's webhook acknowledgement.

See:

- `docs/META-SETUP.md`
- `docs/WEBHOOK-TROUBLESHOOTING.md`
- `docs/DEPLOYMENT.md`

## WhatsApp links

Set your links once in `.env`:

```env
WHATSAPP_CHANNEL_URL=https://...
WHATSAPP_GROUP_URL=https://...
SUPPORT_URL=https://...
```

The application reads them from configuration instead of hard-coding them into commands.

## Branding

The supplied THANXIE AI artwork is:

```text
assets/branding/thanxie-default.png
```

The active brand image is managed centrally. Owner-only branding commands include:

```text
.setbotimage
.branding
.brandingstatus
.previewbranding
.resetbranding
```

A WhatsApp message-media ID is not the same thing as a business profile photo handle. The code keeps those operations separate.

## AI

AI is optional. Configure:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
```

If AI is not configured, the bot remains usable for its non-AI commands.

## Important Meta capability rule

Some group-management and participant features depend on the capabilities available to the deployed Meta account and API version.

THANXIE AI does **not** replace unavailable Meta capabilities with unofficial WhatsApp libraries.

If Meta does not expose an operation, the bot should log/notify the administrator rather than pretending it completed the action.

## Docker

```bash
docker compose up -d --build
```

The SQLite database is persisted in the Docker volume `thanxie-data`.

## GitHub

Before publishing:

```bash
npm install
npm run check
npm test
```

Then commit the project. `.env` and SQLite database files are ignored by `.gitignore`.

---

**THANXIE AI**  
Developed by **THANXIE**


## Community welcome cards

The official Meta webhook keeps group participant handling separate from normal message handling. When the Groups API is enabled and Meta delivers participant events, THANXIE AI can:

- greet new members in the group;
- highlight detected group admins;
- show a clear CTA for the official WhatsApp channel;
- list configured group and channel links with labels;
- record joins/leaves and post the updated membership statistics;
- post a farewell when a member leaves.

Configure `WHATSAPP_CHANNEL_LINKS` and `WHATSAPP_GROUP_LINKS` as JSON arrays, for example:

```env
WHATSAPP_CHANNEL_LINKS=[{"label":"Official Channel","url":"https://whatsapp.com/channel/..."}]
WHATSAPP_GROUP_LINKS=[{"label":"Main Group","url":"https://chat.whatsapp.com/..."},{"label":"Registration Group","url":"https://chat.whatsapp.com/..."}]
```

The welcome is sent as the existing THANXIE branded image card with the links in its caption. This avoids browser automation, Baileys, or WhatsApp Web sessions.


## Safety hardening

The official Meta build disables `.broadcast`, records inbound message timestamps, deduplicates webhook message IDs, serializes outbound delivery, rate-limits outbound messages, combines moderation warnings, and only permits private non-template replies inside the 24-hour customer-service window. AI is configured for Google's free Gemini API by default.
