using Quartz;
using Discord;
using WeatherGoat.Data;
using Discord.WebSocket;
using WeatherGoat.Models;
using WeatherGoat.Services;
using WeatherGoat.Data.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace WeatherGoat.Jobs;

public class AlertReportingJob : IJob
{
    private readonly ILogger<AlertReportingJob>      _logger;
    private readonly IServiceScopeFactory            _scopeFactory;
    private readonly DiscordSocketClient             _client;
    private readonly QueueService                    _queue;
    private readonly AlertService                    _alert;
    private readonly IReadOnlyList<AlertDestination> _destinations;

    public AlertReportingJob(ILogger<AlertReportingJob> logger,
                             IConfiguration             config,
                             IServiceScopeFactory       scopeFactory,
                             DiscordSocketClient        client,
                             QueueService               queue,
                             AlertService               alert)
    {
        _logger       = logger;
        _scopeFactory = scopeFactory;
        _client       = client;
        _queue        = queue;
        _alert        = alert;
        _destinations = config.GetSection("AlertDestination").Get<AlertDestination[]>();
    }
    
    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var cancelToken = context.CancellationToken;
        await using (var scope = _scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            
            _logger.LogDebug("Checking alerts");

            foreach (var dest in _destinations)
            {
                var channelId = dest.ChannelId;
                var zone      = dest.Zone;
                var imageUrl  = dest.RadarImage;

                if (await _client.GetChannelAsync(channelId) is not IMessageChannel channel)
                {
                    _logger.LogError("Could not find channel by ID {Id}", channelId);
                    continue;
                }

                var alert = await _alert.GetAlertForZoneAsync(zone, cancelToken);
                if (alert == null)
                {
                    _logger.LogInformation("No active alerts for {Zone}", zone);
                    continue;
                }
                
                if (alert.Status is AlertStatus.Test or AlertStatus.Draft)
                {
                    _logger.LogInformation("Current active alert for {Zone} is a test or draft, skipping", zone);
                    continue;
                }
                
                var alertId           = alert.Id;
                var alertEvent        = alert.Event;
                var alertAreas        = alert.AreaDescription;
                var alertExpires      = alert.Expires;
                var alertSeverity     = alert.Severity;
                var alertCertainty    = alert.Certainty;
                var alertHeadline     = alert.Headline;
                var alertDescription  = alert.Description;
                var alertInstructions = alert.Instructions;

                var alertReported = await db.HasAlertBeenReportedAsync(alertId);
                if (alertReported)
                {
                    _logger.LogDebug("Alert {Id} has already been broadcast", alertId);
                    continue;
                }

                var embed = new EmbedBuilder()
                            .WithTitle(alertHeadline)
                            .WithDescription($"```md\n{alertDescription}```")
                            .WithImageUrl($"{imageUrl}?{Guid.NewGuid()}")
                            .WithColor(GetSeverityColor(alertSeverity))
                            .WithFooter(alertEvent)
                            .AddField("Certainty", alertCertainty.ToString(), true)
                            .AddField("Effective Until", alertExpires.ToString("g"), true)
                            .AddField("Affected Areas", alertAreas)
                            .WithCurrentTimestamp();

                if (alertInstructions != null)
                {
                    embed.AddField("Instructions", alertInstructions);
                }

                await _queue.EnqueueActionAsync(async () =>
                {
                    await channel.SendMessageAsync(embed: embed.Build());

                    _logger.LogInformation("Reported alert {AlertId} to {ChannelId}", alertId, channelId);

                    await db.Alerts.AddAsync(new SentAlert
                    {
                        AlertId = alertId
                    }, cancelToken);

                    await db.SaveChangesAsync(cancelToken);
                });
            }
        }
    }
    #endregion
    
    private static Color GetSeverityColor(AlertSeverity severity) =>
        severity switch
        {
            AlertSeverity.Extreme  => Color.DarkRed,
            AlertSeverity.Severe   => Color.Red,
            AlertSeverity.Moderate => Color.Orange,
            AlertSeverity.Minor    => Color.Gold,
            _                      => Color.Blue
        };

    private record AlertDestination
    {
        public ulong  ChannelId  { get; set; }
        public string Zone       { get; set; }
        public string RadarImage { get; set; }
    }
}
