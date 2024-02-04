using Serilog;
using Serilog.Events;
using Microsoft.Extensions.Hosting;
using Serilog.Sinks.SystemConsole.Themes;

namespace WeatherGoat.Extensions;

public static class HostBuilderExtensions
{
    public static IHostBuilder AddWeatherGoatLogging(this IHostBuilder hostBuilder) =>
        hostBuilder.UseSerilog((_, config) =>
        {
            config.Enrich.FromLogContext();
            config.MinimumLevel.Override("Default", LogEventLevel.Information);
            config.MinimumLevel.Override("Quartz", LogEventLevel.Warning);
            config.MinimumLevel.Override("System.Net", LogEventLevel.Warning);
            config.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Query", LogEventLevel.Warning);
            config.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Connection", LogEventLevel.Warning);
            config.WriteTo.Console(LogEventLevel.Information, theme: AnsiConsoleTheme.Sixteen, outputTemplate: "{Timestamp:HH:mm:ss.fff} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}");
            config.WriteTo.Async(wt => wt.File(
                Constants.LogFilePath,
                outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level}] [{SourceContext}] {Message:lj}{NewLine}{Exception}",
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 5,
                rollOnFileSizeLimit: true,
                flushToDiskInterval: TimeSpan.FromSeconds(5)
            ));
        });
}
