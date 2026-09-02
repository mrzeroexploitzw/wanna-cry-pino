# Changelog

## 2.0.0 — THANXIE AI

### Added

- 185 live registered command handler paths.
- Dynamic category menus with 20-command pagination.
- Branded image response pipeline for command cards.
- Official Meta media upload/send pipeline for outbound media.
- Official Meta Groups API join-request approval integration.
- Group metadata synchronization for description and participant counts.
- Two-message new-member onboarding with rules and introduction/admin highlight.
- Branded member statistics after joins and branded farewell statistics after leaves.
- OpenAI Responses API integration for AI commands.
- Optional OpenAI `omni-moderation-latest` text/image safety filtering.
- Group moderation for links, bad words, stickers, images, voice notes, mentions, video, audio, spam, view-once policy and anti-delete capability state.
- Free/Premium/Owner media-generation quotas.
- Pino Pino relationship handling, including Lil modecai as brother.
- Owner shutdown/restart/maintenance/broadcast/backup controls.
- Professional GitHub README, release checklist and preview assets.

### Important compatibility behavior

- No Baileys, WhatsApp Web, QR pairing, fake pairing codes or WhatsApp OTP collection.
- Unsupported Meta group operations are capability-gated and never simulated with unofficial APIs.
- Message deletion/editing is not falsely reported when the deployed Meta Groups API does not expose it.
