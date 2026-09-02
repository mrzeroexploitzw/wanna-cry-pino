# Deployment

THANXIE AI can run as a normal Node.js service or in Docker.

## Docker

```bash
docker compose up -d --build
```

Expose HTTPS publicly and configure the Meta webhook to `/webhook`.

Before production:

1. Set a strong `META_VERIFY_TOKEN`.
2. Store the Meta access token in a secret manager/environment, never in Git.
3. Set `META_APP_SECRET` so webhook signatures are verified.
4. Set `OWNER_WHATSAPP_ID` to the owner's Meta-supplied WhatsApp identity.
5. Set the registration configuration.
6. Verify the live Meta API version and permissions.
7. Run `npm test` and `npm run check`.
