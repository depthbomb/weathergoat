using Quartz;
using Humanizer;

namespace WeatherGoat.Jobs;

public class UpdateStatusJob : IJob
{
    private readonly DiscordSocketClient _client;

    public UpdateStatusJob(DiscordSocketClient client)
    {
        _client = client;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        if (_client.Status != UserStatus.DoNotDisturb)
        {
            await _client.SetStatusAsync(UserStatus.DoNotDisturb);
        }

        var uptime = DateTime.Now.Subtract(Constants.StartDate);

        await _client.SetCustomStatusAsync($"Forecasting for {uptime.Humanize(3)} (version {Constants.Version})");
    }
    #endregion
}
