using Quartz;
using Discord;
using Discord.WebSocket;
using WeatherGoat.Models;
using WeatherGoat.Services;
using Microsoft.Extensions.Configuration;

namespace WeatherGoat.Jobs;

public class ForecastReportingJob : IJob
{
    private readonly ILogger<ForecastReportingJob> _logger;
    private readonly DiscordSocketClient           _client;
    private readonly ForecastService               _forecast;
    private readonly IReadOnlyList<ReportLocation> _locations;

    public ForecastReportingJob(ILogger<ForecastReportingJob> logger,
                                IConfiguration                config,
                                DiscordSocketClient           client,
                                ForecastService               forecast)
    {
        _logger    = logger;
        _client    = client;
        _forecast  = forecast;
        _locations = config.GetSection("ReportLocation").Get<ReportLocation[]>();
    }
    
    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        _logger.LogInformation("Checking forecasts");
        
        var cancelToken = context.CancellationToken;
        
        foreach (var loc in _locations)
        {
            if (!loc.ReportForecast)
            {
                continue;
            }
            
            var channelId = loc.ForecastChannel;
            var lat       = loc.Latitude;
            var lon       = loc.Longitude;
            var channel   = await _client.GetChannelAsync(channelId) as SocketTextChannel;
            if (channel == null)
            {
                _logger.LogError("Could not find channel by ID {Id}", channelId);
                continue;
            }

            var report = await _forecast.GetCurrentForecastReportAsync(lat, lon, cancelToken);
            var embed = new EmbedBuilder()
                        .WithTitle($"⛅ {report.Time}'s Forecast for {report.Location}")
                        .WithColor(Color.Blue)
                        .WithThumbnailUrl(report.Icon)
                        .WithDescription(report.DetailedForecast)
                        .WithImageUrl($"{report.RadarImageUrl}?{Guid.NewGuid()}")
                        .AddField("At a glance", report.ShortForecast)
                        .WithTimestamp(DateTimeOffset.Now);

            await channel.SendMessageAsync(embed: embed.Build());

            _logger.LogInformation("Reported forecast for {Lat},{Lon}", loc.Latitude, loc.Longitude);
        }
    }
    #endregion
}
