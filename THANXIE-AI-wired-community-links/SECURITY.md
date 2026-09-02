# Security Policy

## Supported versions

The latest release on the default branch is the supported version.

## Reporting

Do not publish access tokens, webhook secrets, personal WhatsApp IDs or production database files in an issue. Contact the project owner privately.

## Security principles

- Never collect WhatsApp OTPs.
- Never store WhatsApp account credentials.
- Never use QR pairing.
- Verify Meta webhook signatures when `META_APP_SECRET` is configured.
- Keep Meta tokens in environment/secret storage.
