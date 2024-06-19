<div align="center">
	<img src="./art/hero.png" alt="WeatherGoat Banner" title="WeatherGoat">
</div>

A Discord bot for reporting weather alerts and hourly forecasts to channels. Built with [Bun](https://bun.sh/), [Discord.js](https://discord.js.org/), [Prisma](https://www.prisma.io/), and the [National Weather Service API](https://www.weather.gov/documentation/services-web-api).

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
