using Quartz;
using Discord;
using WeatherGoat.Data;
using Discord.WebSocket;
using WeatherGoat.Models;
using WeatherGoat.Services;
using WeatherGoat.Data.Entities;
using Microsoft.Extensions.Configuration;

namespace WeatherGoat.Jobs;

public class AlertReportingJob : IJob
{
    private readonly ILogger<AlertReportingJob>    _logger;
    private readonly IServiceScopeFactory          _scopeFactory;
    private readonly DiscordSocketClient           _client;
    private readonly AlertService                  _alert;
    private readonly IReadOnlyList<ReportLocation> _locations;

    public AlertReportingJob(ILogger<AlertReportingJob> logger,
                             IConfiguration             config,
                             IServiceScopeFactory       scopeFactory,
                             DiscordSocketClient        client,
                             AlertService               alert)
    {
        _logger       = logger;
        _scopeFactory = scopeFactory;
        _client       = client;
        _alert        = alert;
        _locations    = config.GetSection("ReportLocation").Get<ReportLocation[]>();
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var cancelToken = context.CancellationToken;
        await using (var scope = _scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            
            _logger.LogDebug("Checking alerts");

            foreach (var loc in _locations)
            {
                if (!loc.ReportAlerts)
                {
                    continue;
                }
                
                var channelId = loc.AlertChannel;
                if (await _client.GetChannelAsync(channelId) is not IMessageChannel channel)
                {
                    _logger.LogError("Could not find channel by ID {Id}", channelId);
                    continue;
                }

                var alert = await _alert.GetAlertsForLocationAsync(loc.Latitude, loc.Longitude, cancelToken);
                if (alert == null)
                {
                    _logger.LogInformation("No active alerts for {Coordinates}", loc.Coordinates);
                    continue;
                }
                
                if (alert.Status is AlertStatus.Test or AlertStatus.Draft)
                {
                    _logger.LogInformation("Current active alert for {Coordinates} is a test or draft, skipping", loc.Coordinates);
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
                            .WithImageUrl($"{alert.RadarImageUrl}?{Guid.NewGuid()}")
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

                await channel.SendMessageAsync(embed: embed.Build());

                _logger.LogInformation("Reported alert {AlertId} to {ChannelId}", alertId, channelId);

                await db.Alerts.AddAsync(new SentAlert
                {
                    AlertId = alertId
                }, cancelToken);

                await db.SaveChangesAsync(cancelToken);

                if (_locations.Count > 1)
                {
                    await Task.Delay(500, cancelToken);
                }
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
}
