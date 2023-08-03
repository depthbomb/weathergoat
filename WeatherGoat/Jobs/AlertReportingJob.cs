using Quartz;
using Discord;
using WeatherGoat.Data;
using WeatherGoat.Models;
using WeatherGoat.Services;
using WeatherGoat.Data.Entities;
using Microsoft.Extensions.Configuration;

namespace WeatherGoat.Jobs;

public class AlertReportingJob : IJob
{
    private readonly ILogger<AlertReportingJob>    _logger;
    private readonly IServiceScopeFactory          _scopeFactory;
    private readonly DispatcherService             _dispatcher;
    private readonly AlertService                  _alert;
    private readonly IReadOnlyList<ReportLocation> _locations;

    public AlertReportingJob(ILogger<AlertReportingJob> logger,
                             IConfiguration             config,
                             IServiceScopeFactory       scopeFactory,
                             DispatcherService          dispatcher,
                             AlertService               alert)
    {
        _logger       = logger;
        _scopeFactory = scopeFactory;
        _dispatcher   = dispatcher;
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

                var alerts = await _alert.GetAlertsForLocationAsync(loc.Latitude, loc.Longitude, cancelToken);
                if (alerts.Count == 0)
                {
                    _logger.LogDebug("No active alerts for {Coordinates}", loc.Coordinates);
                    continue;
                }
                
                foreach (var alert in alerts)
                {
                    if (alert.Status is AlertStatus.Test or AlertStatus.Draft)
                    {
                        _logger.LogInformation("Current active alert for {Coordinates} is a test or draft, skipping", loc.Coordinates);
                        continue;
                    }

                    var alertReported = await db.HasAlertBeenReportedAsync(alert.Id);
                    if (alertReported)
                    {
                        _logger.LogDebug("Alert {Id} has already been reported", alert.Id);
                        continue;
                    }
                    
                    var embed = new EmbedBuilder()
                                .WithTitle($"🚨 {(alert.IsUpdate ? "[UPDATE] " : "")}{alert.Headline}")
                                .WithDescription($"```md\n{alert.Description}```")
                                .WithImageUrl($"{alert.RadarImageUrl}?{Guid.NewGuid()}")
                                .WithColor(_alert.GetSeverityColor(alert.Severity))
                                .WithFooter(alert.Event)
                                .AddField("Certainty",       alert.Certainty.ToString(),  true)
                                .AddField("Effective Until", alert.Expires.ToString("g"), true)
                                .AddField("Affected Areas",  alert.AreaDescription)
                                .WithCurrentTimestamp();

                    if (alert.Instructions != null)
                    {
                        embed.AddField("Instructions", alert.Instructions);
                    }

                    var channelId = loc.AlertChannel;
                    await _dispatcher.EnqueueMessageAsync(channelId, new DispatcherMessagePayload
                    {
                        Embed = embed.Build()
                    });
                    
                    _logger.LogInformation("Enqueued alert {Id} for {ChannelId}", alert.Id, channelId);
                    
                    await db.Alerts.AddAsync(new SentAlert
                    {
                        AlertId = alert.Id
                    }, cancelToken);
                    await db.SaveChangesAsync(cancelToken);
                }
            }
        }
    }
    #endregion
}
