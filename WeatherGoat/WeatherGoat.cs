using Polly;
using Quartz;
using Discord;
using Serilog;
using Polly.Registry;
using Serilog.Events;
using WeatherGoat.Data;
using WeatherGoat.Jobs;
using Discord.WebSocket;
using WeatherGoat.Shared;
using WeatherGoat.Services;
using Discord.Interactions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Tomlyn.Extensions.Configuration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace WeatherGoat;

public class WeatherGoat
{
    private readonly DiscordSocketClient _client;
    private readonly InteractionService  _interactions;
    private readonly string[]            _args;

    public WeatherGoat(string[] args)
    {
        _args   = args;
        _client = new DiscordSocketClient(new DiscordSocketConfig
        {
            AlwaysDownloadUsers           = false,
            AlwaysResolveStickers         = false,
            AlwaysDownloadDefaultStickers = false,
            MessageCacheSize              = 5_000,
            GatewayIntents = GatewayIntents.Guilds       |
                             GatewayIntents.GuildMembers |
                             GatewayIntents.GuildMessages,
            ConnectionTimeout = int.MaxValue,
            DefaultRetryMode  = RetryMode.AlwaysRetry ^ RetryMode.RetryRatelimit
        });
        _interactions = new InteractionService(_client, new InteractionServiceConfig
        {
            DefaultRunMode             = RunMode.Async,
            EnableAutocompleteHandlers = false,
            UseCompiledLambda          = true
        });
    }

    public async Task StartAsync()
    {
        using var host = Host.CreateDefaultBuilder(_args)
                             .UseConsoleLifetime()
                             .UseSerilog((_, config) =>
                             {
                                 #if DEBUG
                                 const bool debug = true;
                                 #else
                                 const bool debug = false;
                                 #endif

                                 config.Enrich.FromLogContext();
                                 config.MinimumLevel.Debug();
                                 config.MinimumLevel.Override("Microsoft", LogEventLevel.Warning);
                                 config.MinimumLevel.Override("Quartz", LogEventLevel.Information);
                                 config.MinimumLevel.Override("Default", LogEventLevel.Information);
                                 config.MinimumLevel.Override("System.Net.Http.HttpClient", LogEventLevel.Warning);
                                 config.MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Information);
                                 config.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Query", LogEventLevel.Warning);
                                 config.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Connection", LogEventLevel.Warning);
                                 config.MinimumLevel.Override("Microsoft.Extensions.Http.DefaultHttpClientFactory", LogEventLevel.Error);
                                 config.WriteTo.Console(
                                     debug ? LogEventLevel.Debug : LogEventLevel.Information,
                                     theme: AnsiConsoleTheme.Code,
                                     outputTemplate: "{Timestamp:HH:mm:ss.fff} [{Level:u3}] {Message:lj}{NewLine}{Exception}"
                                 );
                                 config.WriteTo.File(
                                     Files.Log,
                                     outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}",
                                     rollingInterval: RollingInterval.Month,
                                     retainedFileCountLimit: 5,
                                     fileSizeLimitBytes: 10_000_000,
                                     rollOnFileSizeLimit: true,
                                     flushToDiskInterval: TimeSpan.FromSeconds(1)
                                 );
                             })
                             .ConfigureAppConfiguration((_, config) =>
                             {
                                 config.AddTomlFile("Config.toml");

                                 if (_args.Length > 0)
                                 {
                                     config.AddCommandLine(_args);
                                 }
                             })
                             .ConfigureServices((_, services) =>
                             {
                                 services.Configure<QuartzOptions>(o => o.SchedulerName = "WeatherGoat Scheduler");
                                 services.AddMemoryCache();
                                 services.AddHttpClient("core", c => c.DefaultRequestHeaders.Add("user-agent", Strings.UserAgent))
                                         .AddPolicyHandlerFromRegistry("GenericHttpRetryPolicy");
                                 services.AddSingleton<IReadOnlyPolicyRegistry<string>>(new PolicyRegistry
                                 {
                                     {
                                         "GenericHttpRetryPolicy",
                                         Policy.HandleResult<HttpResponseMessage>(r => !r.IsSuccessStatusCode)
                                               .WaitAndRetryAsync(5, r => TimeSpan.FromSeconds(Math.Pow(2, r)))
                                     }
                                 });
                                 services.AddDbContextFactory<AppDbContext>(o => o.UseSqlite($"Data Source={Files.Database}"));
                                 services.AddSingleton(_client);
                                 services.AddSingleton(_interactions);
                                 services.AddSingleton<QueueService>();
                                 services.AddSingleton<AlertService>();
                                 services.AddSingleton<ForecastService>();
                                 services.AddHostedService<DiscordService>();
                                 services.AddQuartz(q =>
                                 {
                                     q.UseMicrosoftDependencyInjectionJobFactory();
                                     q.ScheduleJob<CleanupJob>(t =>
                                     {
                                         t.WithIdentity("Cleanup Job");
                                         t.WithDescription("Cleans up sent messages");
                                         t.WithCronSchedule("0 59 23 * * ?");
                                     });
                                     q.ScheduleJob<AlertReportingJob>(t =>
                                     {
                                         t.WithIdentity("Alert Reporting Job");
                                         t.WithDescription("Reports weather alerts to the specified channel");
                                         t.StartAt(DateBuilder.EvenSecondDate(DateTimeOffset.Now.AddSeconds(5)));
                                         t.WithSimpleSchedule(x => x.WithIntervalInSeconds(30).RepeatForever());
                                     });
                                     q.ScheduleJob<ForecastReportingJob>(t =>
                                     {
                                         t.WithIdentity("Forecast Reporting Job");
                                         t.WithDescription("Reports the hourly forecast to the specified channel");
                                         t.WithCronSchedule("0 0 0-23 * * ?");
                                     });
                                 });
                                 services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
                             })
                             .Build();

        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db                = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var pendingMigrations = await db.Database.GetPendingMigrationsAsync();
            var migrationCount    = pendingMigrations.Count();
            if (migrationCount > 0)
            {
                Console.WriteLine("Running {0} migration(s)", migrationCount);
                await db.Database.MigrateAsync();
            }
        }

        await host.RunAsync();
    }
}
