# THANXIE AI Commands

The command registry is dynamic. The current build contains **185 registered commands**.

## Moderation

```text
.antisticker on/off
.antiimage on/off
.antivoicenote on/off
.antimention on/off
.antilink on/off
.antivideo on/off
.antiaudio on/off
.antispam on/off
.antiviewonce on/off
.antidelete on/off
.antibad on/off
.moderation
.rules
.setrules <rules>
.badword add <word>
.badword remove <word>
.badword list
.autoapprove on/off
```

### Automatic enforcement

When enabled, THANXIE AI checks incoming group messages for:

- links
- abusive/prohibited words
- stickers
- images
- voice notes/audio
- videos
- mentions
- other configured media restrictions

For link and bad-word violations, the bot records a warning and sends the user the group rules.

The official Meta Groups API currently does not provide a general message deletion/edit operation in groups, so the bot never claims it deleted a user's message when the API cannot do so.

## New-member onboarding

The official participant webhook drives a two-message welcome:

**Message 1**

- tags the new user when mention capability is available
- welcomes them
- displays group rules

**Message 2**

- highlights the new user
- shows available admins from the webhook/admin configuration
- asks the user to introduce themselves

## Media quota

```text
.mediaquota
```

Default limits:

- Free: 10 generations per command per day
- Premium: 50 generations per command per day
- Owner: unlimited

Configure with:

```text
MEDIA_MAX_GENERATIONS_FREE=10
MEDIA_MAX_GENERATIONS_PREMIUM=50
```

These limits apply to generation requests. Ordinary WhatsApp media messaging still uses the official Meta media upload and `/messages` APIs.

## Registration

```text
.register
.terms
.profile
.lang
.slang
```

## Branding

Owner only:

```text
.setbotimage
.branding
.brandingstatus
.resetbranding
```

## Pino Pino

```text
.pinopino
.pinopino add <name> [relation]
.pinopino remove <name>
.pinopino list
.pinopino suggest
```

Initial owner entries:

- Lil gangstar — friend
- Lil modecai — brother

## Scalable menus

```text
.menu
.menu moderation
.menu media
.menu ai
.menu fun
.menu pinoPino
.help <command>
.searchcommand <term>
.commands
```
