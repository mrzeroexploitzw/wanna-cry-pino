# THANXIE AI — Meta WhatsApp Business Platform Setup

THANXIE AI uses the official Meta WhatsApp Business Platform only. It does **not** use Baileys, WhatsApp Web automation, QR pairing, fake pairing codes, or WhatsApp OTP collection.

## Core credentials

Set:

- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_WABA_ID`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`

Subscribe the application to the WABA so webhook notifications are delivered. Meta's official Postman collection documents `POST /<WABA-ID>/subscribed_apps` for this subscription. See the official collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

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

Meta documentation currently describes group join requests and approval through the Groups API, including `GET /<GROUP_ID>/join_requests` and `POST /<GROUP_ID>/join_requests`. The project therefore uses join-request IDs, not phone numbers, for approval.

## Registration restriction

Self-registration is accepted **only** when `.register` is received in `REGISTRATION_GROUP_ID`.

The bot rejects registration from:

- private chats
- unrelated groups
- other conversations

Users are directed to:

`REGISTRATION_GROUP_LINK`

No manual database account creation is required after deployment.

## Group welcome workflow

For supported `group_participants_update` events, THANXIE AI:

1. Reads available group metadata.
2. Reads the group description when exposed by the API.
3. Reads admin information when the webhook/API exposes admin flags.
4. Sends a branded welcome/rules message tagging the new member.
5. Sends a separate branded introduction/admin message tagging the member and available admins.
6. Updates member statistics.
7. Posts the updated statistics in the group.

## Goodbye workflow

For supported participant-removal/leave events, the bot sends a branded farewell card, tags the departing user when mentions are supported, and displays:

- members remaining
- total joined
- total members who have left

## Message deletion limitation

The project deliberately does not fake message deletion. Current WhatsApp business group documentation indicates that group message editing/deletion is not available through the official Groups API. Therefore `.antilink`, `.antidelete`, and related protections record violations and warn users, but the bot will not claim it deleted a group message when Meta did not expose that operation.

## View-once limitation

View-once media is not supported in Groups API groups. `.antiviewonce` is retained as a capability-aware policy setting and will not pretend to remove unsupported content.

## Media

Inbound media is downloaded through Meta's media endpoints. Outbound image/video/audio/document/sticker media is uploaded to Meta and sent through the official WhatsApp Cloud API media message endpoints.

The supplied THANXIE AI brand artwork is uploaded to Meta on first use when no configured media ID exists. The resulting media ID is cached in SQLite.

The owner-only `.setbotimage` command uploads the new artwork and separately attempts the official WhatsApp Business Profile image workflow. A message-media upload is never treated as a profile-photo update.

## AI

Optional AI responses use the official OpenAI API when configured:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=<key>
GEMINI_MODEL=gemini-2.5-flash-lite
```

OpenAI's current model documentation lists GPT-5.6 Luna as a cost-sensitive, high-volume model available through the Responses API.

## Public utility APIs

The project uses simple public HTTPS APIs for non-Meta utilities where appropriate:

- Open-Meteo — weather/geocoding
- Frankfurter — currency conversion
- DictionaryAPI — dictionary lookup

These services are isolated from Meta messaging. They never authenticate or pair WhatsApp accounts.

## Community links used by welcome cards

`WHATSAPP_CHANNEL_URL` and `WHATSAPP_GROUP_URL` remain supported as single-link fallbacks. For multiple links, use JSON arrays:

```env
WHATSAPP_CHANNEL_LINKS=[{"label":"Official Channel","url":"https://whatsapp.com/channel/..."}]
WHATSAPP_GROUP_LINKS=[{"label":"Main Group","url":"https://chat.whatsapp.com/..."},{"label":"Registration Group","url":"https://chat.whatsapp.com/..."}]
```

When the official Groups API sends participant events, the bot greets joins, highlights detected admins, includes the channel CTA and labeled community links, and posts a farewell plus membership statistics when someone leaves.
