using Quartz;
using WeatherGoat.Data;
using WeatherGoat.Services;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Jobs;

public class ForecastReportingJob : IJob
{
    private readonly ILogger<ForecastReportingJob>   _logger;
    private readonly IDbContextFactory<AppDbContext> _contextFactory;
    private readonly DiscordSocketClient             _client;
    private readonly ForecastService                 _forecast;
    private readonly LocationService                 _location;

    public ForecastReportingJob(ILogger<ForecastReportingJob>   logger,
                                IDbContextFactory<AppDbContext> contextFactory,
                                DiscordSocketClient             client,
                                ForecastService                 forecast,
                                LocationService                 location)
    {
        _logger         = logger;
        _contextFactory = contextFactory;
        _client         = client;
        _forecast       = forecast;
        _location       = location;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;

        await using var db = await _contextFactory.CreateDbContextAsync(ct);
        
        var destinations = await db.ForecastDestinations.ToListAsync(ct);
        if (destinations.Count == 0)
        {
            return;
        }

        foreach (var destination in destinations)
        {
            var latitude      = destination.Latitude;
            var longitude     = destination.Longitude;
            var channelId     = destination.ChannelId;
            var radarImageUrl = destination.RadarImageUrl;
            var channel       = await _client.GetTextChannelAsync(channelId);
            if (channel == null)
            {
                _logger.LogError("Could not retrieve channel {Id}", channelId);
                continue;
            }

            var forecast = await _forecast.GetForCoordinatesAsync(latitude, longitude, ct);
            var location = await _location.GetInfoAsync(latitude, longitude, ct);
            var embed = new EmbedBuilder()
                        .WithTitle($"\u26c5 {forecast.Name}'s Forecast for {location.Location}")
                        .WithColor(0x06b6d4)
                        .WithThumbnailUrl(forecast.Icon.Replace("medium", "large"))
                        .WithDescription(forecast.DetailedForecast)
                        .AddField("At a glance", forecast.ShortForecast)
                        .WithCurrentTimestamp();

            if (radarImageUrl != null)
            {
                embed.WithImageUrl($"{radarImageUrl}?{Guid.NewGuid()}");
            }

            var sentMessage = await channel.SendMessageAsync(embed: embed.Build(), flags: MessageFlags.SuppressNotification);

            if (destination.AutoCleanup)
            {
                await db.VolatileMessages.AddAsync(new VolatileMessage
                {
                    ChannelId = channelId,
                    MessageId = sentMessage.Id,
                    ExpiresAt = DateTime.Now.AddHours(4)
                }, ct);
                
                await db.SaveChangesAsync(ct);
            }
        }
    }
    #endregion
}
