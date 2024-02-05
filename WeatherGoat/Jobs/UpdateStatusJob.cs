﻿using Quartz;
using Humanizer;
using System.Text;
using WeatherGoat.Services;

namespace WeatherGoat.Jobs;

public class UpdateStatusJob : IJob
{
    private readonly DiscordSocketClient _client;
    private readonly GitHubService       _github;

    public UpdateStatusJob(DiscordSocketClient client, GitHubService github)
    {
        _client = client;
        _github = github;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        
        if (_client.Status != UserStatus.DoNotDisturb)
        {
            await _client.SetStatusAsync(UserStatus.DoNotDisturb);
        }

        var sb = new StringBuilder();
        sb.Append("Forecasting for ")
          .Append(DateTime.Now.Subtract(Globals.StartDate).Humanize(3))
          .Append(" | v")
          .Append(Globals.Version);

        var hash = await _github.GetLatestCommitHashAsync(ct);
        if (hash != null)
        {
            sb.Append('/')
              .Append(hash);
        }

        await _client.SetCustomStatusAsync(sb.ToString());
    }
    #endregion
}
