<div align="center">
	<img src="./art/hero.png" alt="WeatherGoat Banner" title="WeatherGoat">
</div>

A Discord bot for reporting weather alerts and hourly forecasts to channels. Built with [Bun](https://bun.sh/), [Discord.js](https://discord.js.org/), [Drizzle](https://orm.drizzle.team/), and the [National Weather Service API](https://www.weather.gov/documentation/services-web-api).

## Self-Hosting

The project is specifically written for Bun and thus does not have any sort of build step. Running via Node.js is not supported and may not be supported in the future.

1. Clone the repository
2. Install dependencies with `bun install`
3. Create a `.env` file in the root directory with the following contents:
```env
BOT_ID=<your-bot-id>
BOT_TOKEN=<your-bot-token>
SENTRY_DSN=<sentry-project-dsn> # Optional Sentry error reporting
```
1. Run database migrations with `bun migrate`
2. Register the bot's commands by one of two ways:
    - Globally by running `bun start mc create`
    - In specific guilds by running `bun start mc create <guild-id1> <guild-id2> ...`
3. Start the bot with `bun start`
