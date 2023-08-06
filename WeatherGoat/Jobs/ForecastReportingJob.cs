﻿using Polly;
using Quartz;
using Discord;
using Polly.Registry;
using WeatherGoat.Models;
using WeatherGoat.Services;
using Microsoft.Extensions.Configuration;

namespace WeatherGoat.Jobs;

public class ForecastReportingJob : IJob
{
    private readonly ILogger<ForecastReportingJob> _logger;
    private readonly DispatcherService             _dispatcher;
    private readonly ForecastService               _forecast;
    private readonly IReadOnlyList<ReportLocation> _locations;
    private readonly ResilienceStrategy            _retry;

    public ForecastReportingJob(ILogger<ForecastReportingJob>      logger,
                                IConfiguration                     config,
                                DispatcherService                  dispatcher,
                                ForecastService                    forecast,
                                ResilienceStrategyProvider<string> resilienceProvider)
    {
        _logger     = logger;
        _dispatcher = dispatcher;
        _forecast   = forecast;
        _locations  = config.GetSection("ReportLocation").Get<ReportLocation[]>();
        _retry      = resilienceProvider.GetStrategy("generic-exponential-retry");
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        _logger.LogInformation("Checking forecasts");
        
        var ct = context.CancellationToken;
        
        foreach (var loc in _locations)
        {
            if (!loc.ReportForecast)
            {
                continue;
            }
            
            var channelId = loc.ForecastChannel;
            var lat       = loc.Latitude;
            var lon       = loc.Longitude;
            var report    = await _retry.ExecuteAsync(async token => await _forecast.GetCurrentForecastReportAsync(lat, lon, token), ct);
            var embed = new EmbedBuilder()
                        .WithTitle($"⛅ {report.Time}'s Forecast for {report.Location}")
                        .WithColor(Color.Blue)
                        .WithThumbnailUrl(report.Icon)
                        .WithDescription(report.DetailedForecast)
                        .WithImageUrl($"{loc.RadarImageUrlOverride ?? report.RadarImageUrl}?{Guid.NewGuid()}")
                        .AddField("At a glance", report.ShortForecast)
                        .WithTimestamp(DateTimeOffset.Now);

            await _dispatcher.EnqueueMessageAsync(channelId, new DispatcherMessagePayload
            {
                Embed = embed.Build()
            });

            _logger.LogInformation("Reported forecast for {Lat},{Lon}", loc.Latitude, loc.Longitude);
        }
    }
    #endregion
}
