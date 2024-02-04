using Quartz;
using WeatherGoat.Services;

namespace WeatherGoat.Jobs;

public class CommitHashRetrievalJob : IJob
{
    private readonly GitHubService _github;

    public CommitHashRetrievalJob(GitHubService github)
    {
        _github = github;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        await _github.GetLatestCommitHashAsync();
    }
    #endregion
}
