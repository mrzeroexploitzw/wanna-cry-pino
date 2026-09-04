# THANXIE AI — Meta WhatsApp Business Platform Setup

THANXIE AI uses the official Meta WhatsApp Business Platform / Cloud API for message delivery and group features. The project does **not** use Baileys, WhatsApp Web automation, QR pairing, or unofficial WhatsApp sessions.

## Core credentials

Set:

- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_WABA_ID`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`

Subscribe the application to the WABA so webhook notifications are delivered.

## Phone-number pairing / onboarding

The project now includes an **official Meta phone-number onboarding flow**. It is deliberately different from WhatsApp Web pairing.

Enable it with:

```env
PHONE_PAIRING_ENABLED=true
PAIRING_ADMIN_TOKEN=<long-random-secret>
```

The administrative endpoint is:

```text
GET  /pairing
POST /pairing
```

Both endpoints require:

```text
Authorization: Bearer <PAIRING_ADMIN_TOKEN>
```

The POST body is:

```json
{
  "phone_number": "+2637XXXXXXXX",
  "pin": "123456"
}
```

The service first checks that the phone number already exists in the configured Meta WABA, then uses Meta's registration endpoint for that phone-number ID. The 6-digit PIN is passed to Meta and is not stored in SQLite. Only the phone number, Meta phone-number ID, verified name, and registration status are persisted.

**Important:** this does not turn a normal personal WhatsApp account into a Cloud API session and does not create a WhatsApp-Web-style pairing code. The number must be eligible for Meta's WhatsApp Business Platform onboarding and the required Meta verification/setup must be completed in Meta's systems.

## Groups API

THANXIE AI supports the current Meta Groups API architecture where the account is eligible for it. The project listens for group participant updates and can use join-request approval endpoints when the capability is enabled for the account/API version.

Set:

```env
META_GROUPS_API_ENABLED=true
META_GROUP_JOIN_APPROVAL_ENABLED=true
META_GROUP_MENTIONS_ENABLED=true
REGISTRATION_GROUP_ID=<actual Meta group ID>
```

The group invite URL is only a human-facing onboarding link. The bot must use the actual Meta group ID received from the Groups API/webhooks for enforcement.

## Existing bot functionality

The phone onboarding addition leaves the existing bot architecture intact:

- command registry and menus;
- registration workflow;
- AI chat and multilingual personalization;
- group welcome/farewell workflows;
- moderation and warning system;
- Pino Pino features;
- premium controls;
- media processing and branding;
- SQLite persistence;
- Meta webhook verification/signature validation;
- outbound rate limiting and safety controls;
- Docker and health/readiness endpoints.

Meta remains the messaging core; no unofficial WhatsApp library is introduced.

## Security

Never commit `PAIRING_ADMIN_TOKEN`, `META_ACCESS_TOKEN`, or other secrets. Use a hosting-provider secret manager/environment variables in production. Rotate the pairing admin token if it is exposed.

## Registration restriction

Self-registration is accepted **only** when `.register` is received in `REGISTRATION_GROUP_ID`.

The bot rejects registration from private chats, unrelated groups, and other conversations.

## Message deletion limitation

The project deliberately does not fake message deletion. Where the official Groups API does not expose an operation, the bot records/warns rather than claiming an unsupported action was completed.

## View-once limitation

View-once media is not supported in Groups API groups. `.antiviewonce` remains capability-aware and does not pretend to remove unsupported content.

## Media

Inbound and outbound media continue to use Meta's official media endpoints. The THANXIE AI brand artwork is cached as a Meta media ID in SQLite.

## AI

Optional AI responses use the configured provider. The repository defaults to Google's Gemini configuration:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=<key>
GEMINI_MODEL=gemini-2.5-flash-lite
```

## Community links

`WHATSAPP_CHANNEL_URL` and `WHATSAPP_GROUP_URL` remain supported as single-link fallbacks. Multiple links can be supplied through the existing JSON-array environment variables.
