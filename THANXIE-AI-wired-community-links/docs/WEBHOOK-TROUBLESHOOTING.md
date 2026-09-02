# Meta Webhook Troubleshooting

This project keeps the webhook intentionally small so it is easier to configure.

## Endpoint

Your callback URL must be:

```text
https://YOUR-DOMAIN/webhook
```

Not:

```text
https://YOUR-DOMAIN/
```

## 1. Test the health endpoint first

Open:

```text
https://YOUR-DOMAIN/health
```

You should receive JSON similar to:

```json
{
  "status": "ok",
  "service": "thanxie-ai",
  "commands": 185
}
```

If `/health` does not work, fix the hosting/deployment problem before touching Meta.

## 2. Verify the Meta token

Your `.env` contains:

```env
META_VERIFY_TOKEN=choose-a-random-secret-string
```

In Meta's webhook configuration, enter **exactly the same value**.

Do not use the access token as the verify token.

## 3. The verification request

Meta sends a GET request similar to:

```text
/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=SOME_VALUE
```

THANXIE AI returns the challenge only when:

```text
hub.mode == subscribe
AND
hub.verify_token == META_VERIFY_TOKEN
```

Otherwise it returns HTTP 403.

## 4. POST signature

Production deployments should set:

```env
META_APP_SECRET=...
```

The application validates:

```text
X-Hub-Signature-256
```

If `META_APP_SECRET` is missing in production, POST webhook requests are rejected.

For local development only, signature validation can remain permissive.

## 5. Meta must reach your server

The callback must be publicly reachable.

This will NOT work for Meta:

```text
localhost
127.0.0.1
192.168.x.x
```

Use a real HTTPS deployment.

## 6. Do not put AI processing in the verification route

The webhook is intentionally separated from the AI engine.

```text
GET /webhook
  -> verify

POST /webhook
  -> validate
  -> acknowledge HTTP 200
  -> process asynchronously
```

This keeps webhook responses fast.

## 7. Check the logs

Start locally:

```bash
npm start
```

Watch for:

```text
THANXIE AI started
```

Webhook processing failures appear as:

```text
WEBHOOK_PROCESSING_FAILED
```

## 8. Check the Meta subscription

After callback verification, make sure the WhatsApp Business Account is subscribed to the webhook fields required by your application.

The callback can be perfectly configured while the WABA is not subscribed, resulting in no incoming events.

## 9. Keep credentials out of GitHub

Never publish:

```text
META_ACCESS_TOKEN
META_APP_SECRET
GEMINI_API_KEY
```

Use `.env` locally and environment/secrets configuration on your host.

## 10. If verification still fails

Collect these four things:

1. `/health` response
2. Public webhook URL
3. HTTP status shown by your hosting logs
4. Exact Meta verification error

Do not paste access tokens or app secrets.

With those four pieces, the failure can normally be isolated to:

- wrong callback URL
- wrong verify token
- HTTPS/hosting problem
- application not listening on the expected port
- proxy/routing problem
- Meta-side subscription/configuration problem
