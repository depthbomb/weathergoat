<div align="center">
	<img src="./art/hero.png" alt="WeatherGoat Banner" title="WeatherGoat">
</div>

A Discord bot for reporting weather alerts and hourly forecasts to channels. Built with [Bun](https://bun.sh/), [Discord.js](https://discord.js.org/), [Prisma](https://www.prisma.io/), and the [National Weather Service API](https://www.weather.gov/documentation/services-web-api).

## Self-Hosting

### Installing

The project is specifically written for Bun and thus does not have any sort of build step. Running via Node.js is not supported and may not be supported in the future.

1. Clone the repository
2. Install dependencies with `bun install`
3. Create a `.env` file in the root directory with the following contents:
```env
MODE=production # set to "development" to enable debug features
BOT_ID=1234
BOT_TOKEN=abcdef
OWNER_ID=1234 # required for legacy commands (see section)
LEGACY_COMMAND_PREFIX=! # required for legacy commands (see section)
DATABASE_URL=file:path/to/sqlite/database # example: file:../.data/weathergoat.db
SENTRY_DSN=https://abcdef # Optional Sentry error reporting
GITHUB_REPO=depthbomb/weathergoat # Optional, required if the value below is set
GITHUB_ACCESS_TOKEN=ghp_12345abdef # Optional, ignore unless you are self-hosting *your own fork* of the project
# Max destinations per guild
MAX_RADAR_CHANNELS_PER_GUILD=5
MAX_ALERT_DESTINATIONS_PER_GUILD=5
MAX_FORECAST_DESTINATIONS_PER_GUILD=5
```
4. Generate the Prisma client with `bun generate-client`
5. Run database production migrations with `bun migrate:p`
    - This can be ran whenever as it won't do anything if there are no pending migrations
6. Register the bot's commands by one of two ways:
    - Globally by running `bun start mc create`
    - In specific guilds by running `bun start mc create <guild-id1> <guild-id2> ...`
7. Start the bot with `bun start`

### Legacy Commands

WeatherGoat utilizes "legacy commands", commands that are executed by parsing message content, to handle _owner-only_ commands. These commands are primarily used for debug purposes.

### Feature flags

WeatherGoat implements a type of feature flag system that allows you to adjust the probability of a feature being enabled or toggling a feature outright without restarting it. This is achieved by editing the **features.toml** file located in the project root. When changes to it are made, WeatherGoat will parse it and reload the features.

If you are developing new features to test then you can add them:

```toml
features = [
	{ name = "com.my.cool.Feature", fraction = 0.5 },
]
```
and check if they should be enabled with:
```ts
const isEnabled = featuresService.get('com.my.cool.Feature');
if (isEnabled()) {
	// ...
}

// or with graceful degredation by providing a default value
const isEnabled = featuresService.isFeatureEnabled('com.my.cool.Feature', false);
if (isEnabled) {
	// `isEnabled` will be `false` if "com.my.cool.Feature" does not exist.
	// Not providing a default value will throw if the feature does not exist.
}
```

Currently this system is used as a sort of killswitch to quickly toggle features such as forecast and alert reporting in the case of an emergency.

## Using the bot

WeatherGoat's main purpose, reporting, works by checking "destinations" that you create via slash commands. There are two types of destinations:

- **Alerts**: where weather alerts will be posted to for the area that the destination covers. Alert messages will be deleted when the alert expires.
- **Hourly forecasts**: where an hourly forecast message will be sent for the area that the destination covers. Forecast messages will be deleted after 4 hours of being sent.

Both commands for managing destinations are similar in that they both have a top-level command (`/alerts` and `/forecasts`) with subcommands: `add`, `remove`, and `list`.

The `add` subcommand for both commands requires a latitude, longitude, and channel. Each command may also have additional options specific to the command.

When you successfully create a destination, you will be given an ID that you can use to remove the destination later with the `remove` subcommand.

The `list` subcommand simply lists all destinations for a channel as well as the options for each. You can use this command to get a destination's ID if you lost it.

The `/add` and `/remove` subcommands require the user to have the **MANAGE_GUILD** permission.

The `/radar-channel` command allows you to specify a channel in which the bot will send a message containing a weather radar loop for a region. The message will be periodically edited to update the image to achieve a form of "live" radar.
