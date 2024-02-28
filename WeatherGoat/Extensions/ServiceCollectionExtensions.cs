using Polly;
using Quartz;
using WeatherGoat.Data;
using WeatherGoat.Jobs;
using WeatherGoat.Services;
using Microsoft.EntityFrameworkCore;
using WeatherGoat.Data.CompiledModels;
using Microsoft.Extensions.DependencyInjection;

namespace WeatherGoat.Extensions;

public static class ServiceCollectionExtensions
{
    public static void AddWeatherGoatDatabase(this IServiceCollection services) =>
        services.AddDbContextFactory<AppDbContext>(o =>
        {
            o.UseModel(AppDbContextModel.Instance);
            o.UseSqlite($"Data Source={Constants.DatabaseFilePath}");
        });

    public static void AddWeatherGoatServices(this IServiceCollection services) =>
        services.AddSingleton<FeatureService>()
                .AddSingleton<GitHubService>()
                .AddSingleton<CommandService>()
                .AddSingleton<AlertsService>()
                .AddSingleton<LocationService>()
                .AddSingleton<ForecastService>();

    public static void AddHostedWeatherGoatServices(this IServiceCollection services) =>
        services.AddHostedService<DiscordHostedService>()
                .AddHostedService<SlashCommandInteractionHostedService>();

    public static void AddWeatherGoatHttpClients(this IServiceCollection services)
    {
        services.AddHttpClient("Browser", client => client.DefaultRequestHeaders.Add("User-Agent", Constants.BrowserUserAgent));
        services.AddHttpClient("Bot", client => client.DefaultRequestHeaders.Add("User-Agent", Constants.BrowserUserAgent));
        services.AddHttpClient("NWS", client =>
                {
                    client.BaseAddress = new Uri("https://api.weather.gov");
                    client.DefaultRequestHeaders.Add("User-Agent", Constants.BotUserAgent);
                    client.DefaultRequestHeaders.Add("Accept", "application/ld+json");
                })
                .AddTransientHttpErrorPolicy(builder => builder.WaitAndRetryAsync(10, attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt))));
    }
    
    public static void AddWeatherGoatJobs(this IServiceCollection services) =>
        services.Configure<QuartzOptions>(o => o.SchedulerName = "WeatherGoat Scheduler")
                .AddQuartz(q =>
                {
                    q.ScheduleJob<AlertReportingJob>(j =>
                    {
                        j.WithIdentity("WeatherAlertReporting");
                        j.WithDescription("Reports active weather alerts to the appropriate destinations");
                        j.StartAt(DateTime.Now.AddSeconds(10));
                        j.WithSimpleSchedule(s =>
                        {
                            s.WithIntervalInSeconds(15);
                            s.RepeatForever();
                        });
                    });
                    
                    q.ScheduleJob<ForecastReportingJob>(j =>
                    {
                        j.WithIdentity("WeatherForecastReporting");
                        j.WithDescription("Reports weather forecasts to the appropriate destinations");
                        j.StartAt(DateTime.Now.AddSeconds(10));
                        j.WithCronSchedule("0 0 0-23 * * ?");
                    });
                    
                    q.ScheduleJob<CleanUpMessagesJob>(j =>
                    {
                        j.WithIdentity("VolatileMessageCleanup");
                        j.WithDescription("Deletes messages that are marked as \"volatile\"");
                        j.StartAt(DateTime.Now.AddSeconds(10));
                        j.WithSimpleSchedule(s =>
                        {
                            s.WithIntervalInMinutes(1);
                            s.RepeatForever();
                        });
                    });
                    
                    q.ScheduleJob<CleanUpGuildEventsJob>(j =>
                    {
                        j.WithIdentity("GuildEventsCleanup");
                        j.WithDescription("Deletes guild events that we have created that have ended");
                        j.StartAt(DateTime.Now.AddSeconds(10));
                        j.WithSimpleSchedule(s =>
                        {
                            s.WithIntervalInMinutes(1);
                            s.RepeatForever();
                        });
                    });
                    
                    q.ScheduleJob<UpdateStatusJob>(j =>
                    {
                        j.WithIdentity("UpdateStatus");
                        j.WithDescription("Updates the bot's Discord status with our current uptime");
                        j.WithSimpleSchedule(s =>
                        {
                            s.WithIntervalInSeconds(15);
                            s.RepeatForever();
                        });
                    });
                    
                    q.ScheduleJob<CommitHashRetrievalJob>(j =>
                    {
                        j.WithIdentity("GitHubLatestCommitHashRetrieval");
                        j.WithDescription("Retrieves and caches the project's latest GitHub commit hash");
                        j.WithSimpleSchedule(s =>
                        {
                            s.WithIntervalInMinutes(10);
                            s.RepeatForever();
                        });
                    });
                })
                .AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
}
