# vitest-discord-reporter

A Vitest reporter that sends test results to a Discord channel via embeds.

- Summary, passed/failed/skipped/total, and duration
- Optional mention when failures occur
- Optional stack traces in failure details
- Configurable inclusion of passed tests

## Install

- npm: `npm i -D @bouaiche/vitest-discord-reporter`
- yarn: `yarn add -D @bouaiche/vitest-discord-reporter`
- pnpm: `pnpm add -D @bouaiche/vitest-discord-reporter`

## Quick start

1) Create a Discord webhook (Server Settings → Integrations → Webhooks) and copy the URL.
2) Expose it as an env var (recommended) and configure the reporter.

vitest.config.ts:

```ts
import { defineConfig } from 'vitest/config';
import { DiscordReporter } from '@bouaiche/vitest-discord-reporter';

export default defineConfig({
  test: {
    reporters: [
      'default',
      new DiscordReporter({
        // Prefer set VITE_DISCORD_REPORTER_WEBHOOK_URL in .env.test var to avoid committing secrets
        webhookUrl: 'https://discord.com/api/webhooks/<channel_id>/<token>',
        title: 'Test Results',
        includeStackTrace: false,
        mentionOnFailure: '',
        showPassedTests: true,
      }),
    ],
  },
});
```

.env (or .env.test):
```
VITE_DISCORD_REPORTER_WEBHOOK_URL=https://discord.com/api/webhooks/<channel_id>/<token>
```

package.json:
```json
{
  "scripts": {
    "test:run": "vitest run"
  }
}
```

## Options

- webhookUrl (string): Discord webhook URL.
- title (string, default: "Test Results"): Title of the summary embed.
- includeStackTrace (boolean, default: false): Include stack traces for failed tests (truncated to fit Discord limits).
- mentionOnFailure (string, default: ""): A string added to the summary embed when there are failures (e.g. `<@1234567890>` or `@team`).
- showPassedTests (boolean, default: true): Include an embed listing passed tests.

## What gets sent

- Summary embed with counts for passed/failed/skipped/total and total duration.
- Failed tests embed: up to 10 failed tests (names and errors). Long names and errors are truncated.
- Passed tests embed: up to 20 passed tests. Long lists are truncated.

Note: Discord enforces size limits on embeds. This reporter truncates fields to avoid rejections.

Mentions: Whether a mention actually pings depends on your webhook and server mention settings.

## CI example (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build --if-present
      - run: npx vitest run
        env:
          VITE_DISCORD_REPORTER_WEBHOOK_URL: ${{ secrets.CI_DISCORD_WEBHOOK_URL }}
```

## Local testing

- Set `VITE_DISCORD_REPORTER_WEBHOOK_URL` in your environment or `.env`
- Run: `npm run test:run` or `npx vitest run`

## Development

- Build: `npm run build`
- Lint: `npm run lint` / `npm run lint:fix`
- Format: `npm run format` / `npm run format:check`
- Tests: `npm run test` or `npm run test:run`

## License

MIT © Mounir Bouaiche
