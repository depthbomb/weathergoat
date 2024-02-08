using Quartz;
using WeatherGoat.Data;
using WeatherGoat.Models;
using WeatherGoat.Services;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Jobs;

public class AlertReportingJob : IJob
{
    private readonly ILogger<AlertReportingJob>      _logger;
    private readonly IDbContextFactory<AppDbContext> _contextFactory;
    private readonly DiscordSocketClient             _client;
    private readonly FeatureService                  _features;
    private readonly LocationService                 _location;
    private readonly AlertsService                   _alerts;

    public AlertReportingJob(ILogger<AlertReportingJob>      logger,
                             IDbContextFactory<AppDbContext> contextFactory,
                             DiscordSocketClient             client,
                             FeatureService                  features,
                             LocationService                 location,
                             AlertsService                   alerts)
    {
        _logger         = logger;
        _contextFactory = contextFactory;
        _client         = client;
        _features       = features;
        _location       = location;
        _alerts         = alerts;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;

        await using var db = await _contextFactory.CreateDbContextAsync(ct);

        var destinations = await db.AlertDestinations.ToListAsync(ct);
        if (destinations.Count == 0)
        {
            return;
        }

        foreach (var destination in destinations)
        {
            var latitude  = destination.Latitude;
            var longitude = destination.Longitude;
            var zoneId    = destination.ZoneId;
            var countyId  = destination.CountyId;
            var channelId = destination.ChannelId;
            var channel   = await _client.GetTextChannelAsync(channelId);
            if (channel == null)
            {
                _logger.LogError("Could not retrieve channel {Id}", channelId);
                continue;
            }

            var alerts = await _alerts.GetActiveForZoneAsync(zoneId, countyId, ct);
            foreach (var alert in alerts.Where(x => x.IsNotTest))
            {
                _logger.LogDebug("Found active alerts for {Location}", destination.CountyId);

                var alertId         = alert.Id;
                var isAlertReported = await db.HasAlertBeenReportedAsync(alertId);
                if (isAlertReported)
                {
                    _logger.LogDebug("Alert {Id} has already been reported to channel {ChannelName} ({ChannelId})", alertId, channel.Name, channelId);
                    continue;
                }

                var embed = new EmbedBuilder()
                            .WithTitle($"🚨 {(alert.Type == AlertMessageType.Update ? "[UPDATE] " : "")}{alert.Headline}")
                            .WithDescription(alert.Description.ToCodeBlock())
                            .WithImageUrl($"{destination.RadarImageUrl}?{Guid.NewGuid()}")
                            .WithColor(alert.SeverityColor)
                            .WithFooter(alert.Event)
                            .AddField("Certainty", alert.Certainty.ToString(), true)
                            .AddField("Effective", alert.EffectiveAt.ToTimestampTag(TimestampTagStyles.Relative), true)
                            .AddField("Expires", alert.ExpiresAt.ToTimestampTag(TimestampTagStyles.Relative), true)
                            .AddField("Affected Areas", alert.AreaDescription)
                            .WithCurrentTimestamp();

                if (alert.Instructions != null)
                {
                    embed.AddField("Instructions", alert.Instructions);
                }

                if (destination.RadarImageUrl != null)
                {
                    embed.ImageUrl = destination.RadarImageUrl;
                }

                var webhook   = await _client.GetOrCreateWebhookAsync(
                    channelId,
                    Constants.AlertWebhookName,
                    "Required for weather alert reporting"
                );
                var messageId = await webhook.SendMessageAsync(
                    username: Constants.AlertWebhookName,
                    avatarUrl: _client.CurrentUser.GetAvatarUrl(),
                    embeds: [embed.Build()]
                );

                await db.SentAlerts.AddAsync(new SentAlert { AlertId = alert.Id }, ct);

                if (destination.AutoCleanup)
                {
                    await db.VolatileMessages.AddAsync(new VolatileMessage
                    {
                        ChannelId = channelId,
                        MessageId = messageId,
                        ExpiresAt = alert.ExpiresAt
                    }, ct);
                }

                await db.SaveChangesAsync(ct);

                if (alert.Type == AlertMessageType.Alert && await _features.IsEnabledAsync("CreateGuildEvents"))
                {
                    var location = await _location.GetInfoAsync(latitude, longitude, ct);
                    var guild    = channel.Guild;
                    await guild.CreateEventAsync(
                        $"{alert.Severity} Weather Alert",
                        DateTimeOffset.Now.AddSeconds(5),
                        GuildScheduledEventType.External,
                        description: alert.Description,
                        endTime: alert.ExpiresAt,
                        location: location.Location,
                        options: new RequestOptions
                        {
                            AuditLogReason = "Created automatically due to an active weather alert in this server. This event will be deleted when the alert expires."
                        }
                    );
                    
                    _logger.LogInformation("Created guild event");
                }
            }
        }
    }
    #endregion
}
