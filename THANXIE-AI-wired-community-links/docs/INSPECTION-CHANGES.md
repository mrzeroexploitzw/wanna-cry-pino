# Simplification Changes

The original archive was inspected before restructuring.

## Problems found

1. The repository's `package.json` expected `src/app.js`, but the actual application was nested under `config/src/`.
2. The tests also imported `../src/...`, so the original test suite failed immediately with `ERR_MODULE_NOT_FOUND`.
3. Several application files used paths such as `../../config/defaults.js` from the nested tree. These paths only become correct after the application is moved to the real `src/` root.
4. `.env.example` and `.gitignore` were referenced by the documentation but were missing from the archive.
5. A SQLite database file was included in the project archive. The simplified release excludes the database so deployment starts clean and secrets/data are not published.
6. The webhook waited for full event processing after sending the HTTP 200 response. The simplified version acknowledges Meta immediately and processes the event in the background.
7. Production webhook signature validation now requires `META_APP_SECRET`; local development can remain permissive.
8. Channel, group and support links are configuration values rather than hard-coded application data.
9. The old `config/src/` nesting was removed. `src/` is now the only application source tree.
10. Webhook troubleshooting documentation was added for the exact configuration problem this project is intended to solve.

## Verification

The simplified project was checked with:

```text
npm run check
```

Result: PASS

The test suite was run with:

```text
npm test
```

Result:

10 tests passed
0 tests failed

The command registry currently contains:

185 commands

No Baileys or WhatsApp-Web automation library is used.
