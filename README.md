# cvik2official-devbot (minimal)

Minimal grammY bot that loads commands from a CSV (see `DemoFromTableBot/bot.json`).

Run locally:

```bash
npm ci
export BOT_TOKEN="your_bot_token"
npm start
```

Notes:
- The bot prefers `DemoFromTableBot/commands-with-start.csv` when present, otherwise it loads the published CSV URL from `DemoFromTableBot/bot.json`.
- A local cache is used to avoid fetching the CSV on every command. Configure TTL with `DEMO_CSV_TTL` (seconds). Default 600s.
- Supabase-related artifacts were removed from this branch; we will re-add production scaffolding when ready.

Secrets
- Do not store secrets in the repository. Use `.env` for local development (add real values to `.env` only locally and keep it in `.gitignore`).
- For CI/CD or production, store secrets as GitHub Actions secrets or in a cloud secret manager.
- Example: set `BOT_TOKEN` in GitHub repository secrets and reference it in your workflow.

Append helper
- A small helper script exists at `tools/append_start.js` which will try to append a `/start` row to the Google Sheet when a service account JSON is available at `./service-account.json`.
- If no service account is found it will write a local file `DemoFromTableBot/commands-with-start.csv` containing the existing CSV plus the new `/start` row.
- Run it with:

```bash
node ./tools/append_start.js
```
