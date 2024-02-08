﻿using Serilog;
using Serilog.Events;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using Serilog.Sinks.SystemConsole.Themes;

namespace WeatherGoat.Extensions;

public static class HostBuilderExtensions
{
    public static IHostBuilder AddWeatherGoatLogging(this IHostBuilder hostBuilder) =>
        hostBuilder.UseSerilog((ctx, config) =>
        {
            #if DEBUG
            var debug = true;
            #elif RELEASE
            var debug = false;
            #endif
            
            config.MinimumLevel.Override("Default", debug ? LogEventLevel.Debug : LogEventLevel.Information);
            config.MinimumLevel.Override("Quartz", debug ? LogEventLevel.Information : LogEventLevel.Warning);
            config.MinimumLevel.Override("System.Net", debug ? LogEventLevel.Information : LogEventLevel.Warning);
            config.Filter.ByExcluding("SourceContext like 'Microsoft.EntityFrameworkCore.Database.Command'");
            config.Enrich.FromLogContext();
            config.WriteTo.Console(
                debug ? LogEventLevel.Debug : LogEventLevel.Information,
                theme: AnsiConsoleTheme.Sixteen,
                outputTemplate: "{Timestamp:HH:mm:ss} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}"
            );
            config.WriteTo.Async(wt => wt.File(
                Constants.LogFilePath,
                outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level}] [{SourceContext}] {Message:lj}{NewLine}{Exception}",
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 5,
                rollOnFileSizeLimit: true,
                flushToDiskInterval: TimeSpan.FromSeconds(5)
            ));

            var sentryDsn = ctx.Configuration.GetValue<string>("SentryDsn");
            if (sentryDsn != null)
            {
                config.WriteTo.Sentry(o =>
                {
                    o.Dsn                    = sentryDsn;
                    o.MinimumBreadcrumbLevel = LogEventLevel.Debug;
                    o.MinimumEventLevel      = LogEventLevel.Error;
                });
            }
        });
}
