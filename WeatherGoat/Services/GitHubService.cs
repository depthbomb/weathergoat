using Octokit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;

namespace WeatherGoat.Services;

public class GitHubService
{
    private const string CacheKey = "GitHubService.LatestCommitHash";
    
    private readonly ILogger<GitHubService> _logger;
    private readonly IMemoryCache           _cache;
    private readonly string                 _username;
    private readonly string                 _repo;
    private readonly GitHubClient           _client;

    public GitHubService(ILogger<GitHubService> logger, IConfiguration config, IMemoryCache cache)
    {
        _logger   = logger;
        _cache    = cache;
        _username = config.GetValue<string>("Services:GitHub:Username");
        _repo     = config.GetValue<string>("Services:GitHub:Repository");
        var token = config.GetValue<string>("Services:GitHub:Token");
        if (_username == null || _repo == null || token == null)
        {
            throw new Exception("Missing GitHub Service configuration value(s)");
        }

        _client = new GitHubClient(new ProductHeaderValue("WeatherGoatNext"))
        {
            Credentials = new Credentials(token)
        };
    }

    public async Task<string?> GetLatestCommitHashAsync()
    {
        if (_cache.TryGetValue<string>(CacheKey, out var hash))
        {
            return hash;
        }
        
        var commits = await _client.Repository.Commit.GetAll(_username, _repo);
        if (commits.Count == 0)
        {
            _logger.LogError("Repository {Owner}/{RepoName} has no commits", _username, _repo);

            return null;
        }

        hash = commits[0].Sha[..7];

        _cache.Set(CacheKey, hash, TimeSpan.FromDays(1));

        return hash;
    }
}
