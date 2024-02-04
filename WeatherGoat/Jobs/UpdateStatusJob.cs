using Quartz;
using Humanizer;
using Microsoft.Extensions.Caching.Memory;

namespace WeatherGoat.Jobs;

public class UpdateStatusJob : IJob
{
    private readonly IMemoryCache        _cache;
    private readonly DiscordSocketClient _client;

    public UpdateStatusJob(IMemoryCache cache, DiscordSocketClient client)
    {
        _cache  = cache;
        _client = client;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        if (_client.Status != UserStatus.DoNotDisturb)
        {
            await _client.SetStatusAsync(UserStatus.DoNotDisturb);
        }

        var uptime  = DateTime.Now.Subtract(Constants.StartDate);
        var message = $"Forecasting for {uptime.Humanize(3)} | version {Constants.Version}";

        if (_cache.TryGetValue("GitHubService.LatestCommitHash", out var hash))
        {
            message += $"/{hash}";
        }

        await _client.SetCustomStatusAsync(message);
    }
    #endregion
}
