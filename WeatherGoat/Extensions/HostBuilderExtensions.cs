using Serilog;
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
            var verbose = true;
            #elif RELEASE
            var verbose = false;
            #endif

            if (verbose)
                config.MinimumLevel.Verbose();
            else
                config.MinimumLevel.Debug();
            config.Enrich.FromLogContext();
            config.Filter.ByExcluding("SourceContext like 'Microsoft.EntityFrameworkCore.Database.Command'");
            config.WriteTo.Console(
                verbose ? LogEventLevel.Debug : LogEventLevel.Information,
                theme: AnsiConsoleTheme.Sixteen,
                outputTemplate: "{Timestamp:HH:mm:ss} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}"
            );
            config.WriteTo.Async(wt => wt.File(
                Constants.LogFilePath,
                outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level}] [{SourceContext}] {Message:lj}{NewLine}{Exception}",
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 7,
                rollOnFileSizeLimit: true
            ));

            var sentryDsn = ctx.Configuration.GetValue<string>("SentryDsn");
            if (sentryDsn != null && !verbose)
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
