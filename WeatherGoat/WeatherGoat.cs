using WeatherGoat.Data;
using WeatherGoat.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace WeatherGoat;

public class WeatherGoat
{
    private readonly IReadOnlyList<string> _args;
    private readonly DiscordSocketClient   _client;
    private readonly InteractionService    _interaction;

    public WeatherGoat(IEnumerable<string> args)
    {
        _args = args.ToList().AsReadOnly();
        _client = new DiscordSocketClient(new DiscordSocketConfig
        {
            AlwaysDownloadUsers           = false,
            AlwaysResolveStickers         = false,
            AlwaysDownloadDefaultStickers = false,
            MessageCacheSize              = 100,
            GatewayIntents = GatewayIntents.Guilds        |
                             GatewayIntents.GuildMembers  |
                             GatewayIntents.GuildMessages |
                             GatewayIntents.GuildWebhooks,
            ConnectionTimeout = int.MaxValue,
            DefaultRetryMode  = RetryMode.AlwaysRetry
        });
        _interaction = new InteractionService(_client, new InteractionServiceConfig
        {
            DefaultRunMode             = RunMode.Async,
            EnableAutocompleteHandlers = false,
            UseCompiledLambda          = true
        });
    }

    public async Task StartAsync()
    {
        var args = _args.ToArray();
        using var host = Host.CreateDefaultBuilder()
                             .UseConsoleLifetime()
                             .ConfigureAppConfiguration(config =>
                             {
                                 config.AddCommandLine(args);
                                 config.AddXmlFile(Constants.ConfigFilePath, optional: false, reloadOnChange: false);
                             })
                             .ConfigureServices(services =>
                             {
                                 services.AddMemoryCache();
                                 services.AddSingleton(_client);
                                 services.AddSingleton(_interaction);
                                 services.AddWeatherGoatJobs();
                                 services.AddWeatherGoatServices();
                                 services.AddWeatherGoatDatabase();
                                 services.AddWeatherGoatHttpClients();
                                 services.AddHostedWeatherGoatServices();
                             })
                             .AddWeatherGoatLogging()
                             .Build();

        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db                = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var logger            = scope.ServiceProvider.GetRequiredService<ILogger<WeatherGoat>>();
            var features          = scope.ServiceProvider.GetRequiredService<FeatureService>();
            var pendingMigrations = await db.Database.GetPendingMigrationsAsync();
            var migrationCount    = pendingMigrations.Count();
            if (migrationCount > 0)
            {
                logger.LogInformation("Running {Count} migration(s)", migrationCount);

                await db.Database.MigrateAsync();
            }

            await features.TryCreateAsync("CREATE_GUILD_EVENTS", "Whether to create guild events for reports");
        }

        await host.RunAsync();
    }
}
