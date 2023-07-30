using Discord;
using Discord.Interactions;
using WeatherGoat.Services;

namespace WeatherGoat.Modules;

[Group("weather", "Weather super command")]
public class WeatherModule : InteractionModuleBase<SocketInteractionContext>
{
    private readonly AlertService    _alerts;
    private readonly ForecastService _forecast;

    public WeatherModule(AlertService alerts, ForecastService forecast)
    {
        _alerts   = alerts;
        _forecast = forecast;
    }

    [SlashCommand("forecast", "Gets the current forecast for the provided location")]
    public async Task GetForecastForLocationAsync(
        [Summary("latitude", "The latitude of the location")]
        string latitude,
        [Summary("longitude", "The longitude of the location")]
        string longitude)
    {
        await DeferAsync();

        try
        {
            var report = await _forecast.GetCurrentForecastReportAsync(latitude, longitude);
            var embed = new EmbedBuilder()
                        .WithTitle($"{report.Time}'s Forecast for {report.Location}")
                        .WithColor(Color.Blue)
                        .WithThumbnailUrl(report.Icon)
                        .WithDescription(report.DetailedForecast)
                        .WithImageUrl($"{report.RadarImageUrl}?{Guid.NewGuid()}")
                        .AddField("At a glance", report.ShortForecast)
                        .WithTimestamp(DateTimeOffset.Now)
                        .Build();

            await ModifyOriginalResponseAsync(m => m.Embed = embed);
        }
        catch (Exception)
        {
            await ModifyOriginalResponseAsync(m => m.Content = "There was an issue getting the forecast for the provided coordinates.");
        }
    }
    
    [SlashCommand("alert", "Gets the current active weather alert for the provided location")]
    public async Task GetAlertForLocationAsync(
        [Summary("latitude", "The latitude of the location")]
        string latitude,
        [Summary("longitude", "The longitude of the location")]
        string longitude)
    {
        await DeferAsync();

        try
        {
            var alerts = await _alerts.GetAlertsForLocationAsync(latitude, longitude);
            if (alerts.Count == 0)
            {
                await ModifyOriginalResponseAsync(m => m.Content = "No active alerts for this location");
            }
            else
            {
                var embeds = new List<Embed>();

                foreach (var alert in alerts)
                {
                    var embed = new EmbedBuilder()
                                .WithTitle(alert.Headline)
                                .WithDescription($"```md\n{alert.Description}```")
                                .WithImageUrl($"{alert.RadarImageUrl}?{Guid.NewGuid()}")
                                .WithColor(_alerts.GetSeverityColor(alert.Severity))
                                .WithFooter(alert.Event)
                                .AddField("Certainty",       alert.Certainty.ToString(),  true)
                                .AddField("Effective Until", alert.Expires.ToString("g"), true)
                                .AddField("Affected Areas",  alert.AreaDescription)
                                .WithCurrentTimestamp();

                    if (alert.Instructions != null)
                    {
                        embed.AddField("Instructions", alert.Instructions);
                    }

                    embeds.Add(embed.Build());
                }
                
                await ModifyOriginalResponseAsync(m => m.Embeds = embeds.ToArray());
            }
        }
        catch (Exception)
        {
            await ModifyOriginalResponseAsync(m => m.Content = "There was an issue getting alerts for the provided coordinates.");
        }
    }
}
