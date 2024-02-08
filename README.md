<div align="center">
	<img src="./art/hero.png" alt="WeatherGoat Banner" title="WeatherGoat">
</div>

---

Discord bot for reporting weather alerts and hourly forecasts to channels. Built with Discord.Net and the National Weather Service API.

## Self-Hosting

Self-hosting is as easy as filling out a config and running the bot binary! The config file looks like the following:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <OwnerId>your user ID</OwnerId>
    <SentryDsn>your Sentry DSN for error reporting (leave blank to disable)</SentryDsn>
    <Services>
        <!--
            This group only applies to the global version of WeatherGoat to retrieve
            the latest git commit hash or if you're just wanting to retrieve it
            yourself.

            Basically, keep it disabled unless you know what you're doing.
        -->
        <GitHub>
            <Enabled>False</Enabled>
            <Username>your GitHub username</Username>
            <Repository>repository name</Repository>
            <Token>GitHub token</Token>
        </GitHub>
    </Services>
</configuration>
```

Save the config as **weathergoat.xml** and place it in the same directory as the bot binary. To get the bot binary you can either clone the repo and compile it yourself or download it from the [releases.](https://github.com/depthbomb/WeatherGoatNext/releases/latest)

## Usage

Coming soon!
