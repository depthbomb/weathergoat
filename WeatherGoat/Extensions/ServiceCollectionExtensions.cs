using Quartz;
using WeatherGoat.Jobs;
using WeatherGoat.Data;
using WeatherGoat.Shared;
using WeatherGoat.Services;
using Microsoft.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;
using WeatherGoat.Data.CompiledModels;

namespace WeatherGoat.Extensions;

public static class ServiceCollectionExtensions
{
    public static void AddWeatherGoatDatabase(this IServiceCollection services) =>
        services.AddDbContextFactory<AppDbContext>(o =>
        {
            o.UseSqlite($"Data Source={Files.Database}");
            o.UseModel(AppDbContextModel.Instance);
        });

    public static void AddWeatherGoatServices(this IServiceCollection services) =>
        services.AddSingleton<LocationService>()
                .AddSingleton<AlertService>()
                .AddSingleton<ForecastService>();
    
    public static void AddWeatherGoatHostedServices(this IServiceCollection services) =>
        services.AddHostedService<DiscordHostedService>();

    public static void AddWeatherGoatHttpClients(this IServiceCollection services) =>
        services.AddHttpClient("NWS", client =>
        {
            client.BaseAddress = new Uri("https://api.weather.gov");
            client.DefaultRequestHeaders.Add(HeaderNames.UserAgent, Strings.UserAgent);
        });

    public static void AddWeatherGoatJobs(this IServiceCollection services) =>
        services.Configure<QuartzOptions>(o => o.SchedulerName = "WeatherGoat Scheduler")
                .AddQuartz(q =>
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
                })
                .AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
}
