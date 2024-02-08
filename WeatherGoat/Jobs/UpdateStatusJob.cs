using Quartz;
using Humanizer;
using System.Text;
using System.Reflection;
using WeatherGoat.Services;

namespace WeatherGoat.Jobs;

public class UpdateStatusJob : IJob
{
    private readonly DiscordSocketClient _client;
    private readonly GitHubService       _github;
    private readonly Version?            _assemblyVersion;

    public UpdateStatusJob(DiscordSocketClient client, GitHubService github)
    {
        _client          = client;
        _github          = github;
        _assemblyVersion = Assembly.GetEntryAssembly()?.GetName().Version;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        
        if (_client.Status != UserStatus.DoNotDisturb)
        {
            await _client.SetStatusAsync(UserStatus.DoNotDisturb);
        }

        var sb = new StringBuilder().Append("Forecasting for ")
                                    .Append(DateTime.Now.Subtract(Constants.StartDate).Humanize(3));
        var hash = await _github.GetLatestCommitHashAsync(ct);

        if (_assemblyVersion != null)
        {
            sb.Append(" (v")
              .Append(_assemblyVersion);
            
            if (hash != null)
            {
                sb.Append('/')
                  .Append(hash);
            }

            sb.Append(')');
        }
        else if (hash != null)
        {
            sb.Append(" (")
              .Append(hash)
              .Append(')');
        }

        await _client.SetCustomStatusAsync(sb.ToString());
    }
    #endregion
}
