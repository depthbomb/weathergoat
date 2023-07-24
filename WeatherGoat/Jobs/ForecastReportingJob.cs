using Quartz;
using Discord;
using Discord.WebSocket;
using WeatherGoat.Services;
using Microsoft.Extensions.Configuration;

namespace WeatherGoat.Jobs;

public class ForecastReportingJob : IJob
{
    private readonly ILogger<ForecastReportingJob>      _logger;
    private readonly DiscordSocketClient                _client;
    private readonly ForecastService                    _forecast;
    private readonly IReadOnlyList<ForecastDestination> _destinations;

    public ForecastReportingJob(ILogger<ForecastReportingJob> logger,
                                IConfiguration                config,
                                DiscordSocketClient           client,
                                ForecastService               forecast)
    {
        _logger       = logger;
        _client       = client;
        _forecast     = forecast;
        _destinations = config.GetSection("ForecastDestination").Get<ForecastDestination[]>();
    }
    
    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        _logger.LogInformation("Checking forecasts");
        
        var cancelToken = context.CancellationToken;
        
        foreach (var dest in _destinations)
        {
            var channelId = dest.ChannelId;
            var lat       = dest.Latitude;
            var lon       = dest.Longitude;
            var channel   = await _client.GetChannelAsync(channelId) as SocketTextChannel;
            if (channel == null)
            {
                _logger.LogError("Could not find channel by ID {Id}", channelId);
                continue;
            }

            var report = await _forecast.GetCurrentForecastReportAsync(lat, lon, cancelToken);
            var embed = new EmbedBuilder()
                        .WithTitle($"{report.Time}'s Forecast for {report.Location}")
                        .WithColor(Color.Blue)
                        .WithThumbnailUrl(report.Icon)
                        .WithDescription(report.DetailedForecast)
                        .WithImageUrl($"{dest.RadarImage}?{Guid.NewGuid()}")
                        .AddField("At a glance", report.ShortForecast)
                        .WithTimestamp(DateTimeOffset.Now);

            await channel.SendMessageAsync(embed: embed.Build());
                
            _logger.LogInformation("Reported forecast for {Lat},{Lon}", dest.Latitude, dest.Longitude);

            if (_destinations.Count > 1)
            {
                await Task.Delay(500, cancelToken);
            }
        }
    }
    #endregion

    private record ForecastDestination
    {
        public ulong  ChannelId  { get; set; }
        public string Latitude   { get; set; }
        public string Longitude  { get; set; }
        public string RadarImage { get; set; }
    }
}
