using Quartz;
using Humanizer;
using System.Text;
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

        var sb = new StringBuilder();
        sb.Append("Forecasting for ")
          .Append(DateTime.Now.Subtract(Constants.StartDate).Humanize(3))
          .Append(" | v")
          .Append(Constants.Version);

        if (_cache.TryGetValue("GitHubService.LatestCommitHash", out var hash))
        {
            sb.Append('/')
              .Append(hash);
        }

        await _client.SetCustomStatusAsync(sb.ToString());
    }
    #endregion
}
