<div align="center">
	<img src="./art/hero.png" alt="WeatherGoat Banner" title="WeatherGoat">
</div>

A Discord bot for reporting weather alerts and hourly forecasts to channels. Built with [Bun](https://bun.sh), [Discord.js](https://discord.js.org), [Prisma](https://www.prisma.io/orm), [Redis](https://redis.io), and the [National Weather Service API](https://www.weather.gov/documentation/services-web-api).

**[Click here](https://discord.com/oauth2/authorize?client_id=1009028718083199016) to add WeatherGoat to your server.**

# Self-hosting

While self-hosting WeatherGoat isn't supported, it's not hard to get it set up and running on your own machine.

First create a `.env` file in the project root and configure it:

```
MODE=development

BOT_TOKEN=abcd
BOT_OWNER_ID=5678

OWNER_PREFIX=%
OWNER_EMAIL=name@website.tld # used to identify requests made to OpenStreetMap's Nominatim

DATABASE_URL=file:./.data/weathergoat.db
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=wg

MAX_RADAR_MESSAGES_PER_GUILD=1
MAX_ALERT_DESTINATIONS_PER_GUILD=2
MAX_FORECAST_DESTINATIONS_PER_GUILD=2
```

Make sure you have a running Redis instance to use.

Next run `bun migrate:p` to run migrations in production mode, `bun generate-messages` to generate the message catalog and `bun generate-client` to generate the Prisma client code for your environment.

Finally use `bun start` to start the bot. Make sure you set the `MODE` environment variable to `production` unless you want verbose websocket logging flooding your logs.

For managing application commands, see owner-only commands below.

Alert publication uses durable delivery claims to prevent retries from duplicating
messages after bookkeeping failures. See [delivery recovery](docs/alert-delivery.md)
for migration and operator instructions, including ambiguous send outcomes.

Geocoding uses a process-wide queue with at least one second between Nominatim
requests, at most 32 queued/running lookups, and a 256-entry, 24-hour result cache.
Concurrent identical searches share one request. Provider `Retry-After` cooldowns
apply to the queue; long cooldowns return an error instead of keeping an interaction
waiting. Run one bot process per public Nominatim quota, or use a shared limiter
before adding processes. See the [provider policy](https://operations.osmfoundation.org/policies/nominatim/).

Discord user/member caches are bounded; see [cache validation](docs/cache-validation.md)
for limits and the reproducible offline benchmark.

# Development

Run `bun install --frozen-lockfile` to install dependencies, `bun run lint` to check code with Oxlint, and `bun run lint:fix` to apply automatic fixes. Linting covers source, tests, scripts, and root configuration files; generated Prisma clients, generated message catalogs, and local data are excluded in `.oxlintrc.json`. Correctness rules are enabled, and warnings fail the lint command.

Run `bun test` and `bunx tsc --noEmit` for tests and TypeScript validation. Oxlint does not replace typechecking. For editor diagnostics, install the [official Oxc VS Code extension](https://oxc.rs/docs/guide/usage/linter/editors.html).

As of version `2026.4.3`, owner-only commands now use the legacy prefixed commands system and the bot requires the `MESSAGE_CONTENT` intent. These commands should be called in the direct messages channel with the bot. These commands will only work for the owner of the application or an admin or developer if the application is owned by a team.

Use the `commands create-global` command to register application commands globally or `commands create [guildIds:string...]` to register commands to specific guilds. Use `delete`/`delete-global` to delete application commands in specific guilds or globally.
