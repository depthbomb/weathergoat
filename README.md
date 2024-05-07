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
4. Run database migrations with `bun migrate`
5. Register the bot's commands by one of two ways:
    - Globally by running `bun start mc create`
    - In specific guilds by running `bun start mc create <guild-id1> <guild-id2> ...`
6. Start the bot with `bun start`

### Using the bot

WeatherGoat works by checking "destinations" that you create via slash commands. There are two types of destinations:

- **Alert reporting destinations** are channels in which weather alerts will be posted to for the area that the destination covers. Alert messages will be deleted when the alert expires or is cancelled before the expiration time.
- **Hourly forecast destinations** are channels in which an hourly forecast message will be sent for the area that the destination covers. Forecast messages will be deleted after 4 hours of being sent which will result in at least 4 messages being up at a time in the channel.

Both commands for managing destinations are similar in that they both have a top-level command (`/alerts` and `/forecasts`) with subcommands: `add`, `remove`, and `list`.

The `add` subcommand for both commands requires a latitude, longitude, and channel. Each command may also have options specific to the command.

When you successfully create a destination, you will be given an ID that you can use to remove the destination later with the `remove` subcommand.

The `list` subcommand simply lists all destinations for a channel as well as the options for each. You can use this command to get a destination's ID if you lost it.

The `/add` and `/remove` subcommands requires the user to have the **MANAGE_GUILD** permission.
