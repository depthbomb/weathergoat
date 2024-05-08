<div align="center">
	<img src="./art/hero.png" alt="WeatherGoat Banner" title="WeatherGoat">
</div>

A Discord bot for reporting weather alerts and hourly forecasts to channels. Built with [Bun](https://bun.sh/), [Discord.js](https://discord.js.org/), [Prisma](https://www.prisma.io/), and the [National Weather Service API](https://www.weather.gov/documentation/services-web-api).

## Self-Hosting

The project is specifically written for Bun and thus does not have any sort of build step. Running via Node.js is not supported and may not be supported in the future.

1. Clone the repository
2. Install dependencies with `bun install`
3. Create a `.env` file in the root directory with the following contents:
```env
BOT_ID=<your-bot-id>
BOT_TOKEN=<your-bot-token>
DATABASE_URL=file:path/to/sqlite/database # example: file:../.data/weathergoat.db
SENTRY_DSN=<sentry-project-dsn> # Optional Sentry error reporting
```
4. Generate the Prisma client with `bun generate-client`
5. Run database production migrations with `bun migrate:p`
    - This can be ran whenever as it won't do anything if there are no pending migrations
6. Register the bot's commands by one of two ways:
    - Globally by running `bun start mc create`
    - In specific guilds by running `bun start mc create <guild-id1> <guild-id2> ...`
7. Start the bot with `bun start`

## Using the bot

WeatherGoat's main purpose, reporting, works by checking "destinations" that you create via slash commands. There are two types of destinations:

- **Alerts**: where weather alerts will be posted to for the area that the destination covers. Alert messages will be deleted when the alert expires.
- **Hourly forecasts**: where an hourly forecast message will be sent for the area that the destination covers. Forecast messages will be deleted after 4 hours of being sent.

Both commands for managing destinations are similar in that they both have a top-level command (`/alerts` and `/forecasts`) with subcommands: `add`, `remove`, and `list`.

The `add` subcommand for both commands requires a latitude, longitude, and channel. Each command may also have additional options specific to the command.

When you successfully create a destination, you will be given an ID that you can use to remove the destination later with the `remove` subcommand.

The `list` subcommand simply lists all destinations for a channel as well as the options for each. You can use this command to get a destination's ID if you lost it.

The `/add` and `/remove` subcommands require the user to have the **MANAGE_GUILD** permission.
