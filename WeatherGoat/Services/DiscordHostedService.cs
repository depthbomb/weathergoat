using Discord;
using Humanizer;
using Discord.WebSocket;
using Microsoft.Extensions.Hosting;
using WeatherGoat.Shared.Extensions;

namespace WeatherGoat.Services;

public class DiscordHostedService : IHostedService, IDisposable
{
    private Timer _activityUpdateTimer;

    private readonly ILogger<DiscordHostedService> _logger;
    private readonly IHostApplicationLifetime      _lifetime;
    private readonly DiscordSocketClient           _client;
    private readonly DateTime                      _startTime;

    public DiscordHostedService(
        ILogger<DiscordHostedService> logger,
        IHostApplicationLifetime lifetime,
        DiscordSocketClient client)
    {
        _logger    = logger;
        _lifetime  = lifetime;
        _client    = client;
        _startTime = DateTime.Now;

        _client.Log          += ClientOnLog;
        _client.Ready        += ClientOnReady;
        _client.Disconnected += ClientOnDisconnected;
    }

    #region Implementation of IHostedService
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var token = Environment.GetEnvironmentVariable("TOKEN");
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogCritical("Missing bot token");
            _lifetime.StopApplication();
        }
        else
        {
            try
            {
                _logger.LogTrace("Using token {Token}", token);

                await _client.LoginAsync(TokenType.Bot, token);
                await _client.StartAsync();
                
                _activityUpdateTimer = new Timer(UpdateActivityAsync, null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(15));
            }
            catch (Exception e)
            {
                _logger.LogCritical(e, "Unable to log in");
                _lifetime.StopApplication();
            }
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Stopping bot");

        _activityUpdateTimer.Change(Timeout.Infinite, 0);
        
        await _client.SetStatusAsync(UserStatus.Invisible);
        await _client.LogoutAsync();
        await _client.DisposeAsync();
    }
    #endregion

    #region Implementation of IDisposable
    public void Dispose()
    {
        _client.Log            -= ClientOnLog;
        _client.Ready          -= ClientOnReady;
        _client.Disconnected   -= ClientOnDisconnected;
        
        _activityUpdateTimer.Dispose();
    }
    #endregion
    
    #region Event Subscriptions
    private Task ClientOnLog(LogMessage log)
    {
        var    level   = log.Severity;
        string message = log.Message;

        if (!message.IsNullOrEmpty())
        {
            // ReSharper disable TemplateIsNotCompileTimeConstantProblem
            switch (level)
            {
                
                case LogSeverity.Critical:
                    _logger.LogCritical(message);
                    break;
                case LogSeverity.Error:
                    _logger.LogError(message);
                    break;
                case LogSeverity.Warning:
                    _logger.LogWarning(message);
                    break;
                case LogSeverity.Info:
                    _logger.LogInformation(message);
                    break;
                default:
                case LogSeverity.Debug:
                    _logger.LogDebug(message);
                    break;
                case LogSeverity.Verbose:
                    _logger.LogTrace(message);
                    break;
            }
            // ReSharper enable TemplateIsNotCompileTimeConstantProblem
        }
        
        return Task.CompletedTask;
    }
    
    private async Task ClientOnReady()
    {
        await _client.SetStatusAsync(UserStatus.DoNotDisturb);
    }
    
    private Task ClientOnDisconnected(Exception e)
    {
        if (e is not TaskCanceledException)
        {
            _logger.LogError(e, "Client disconnected");
        }

        return Task.CompletedTask;
    }
    #endregion
    
    private async void UpdateActivityAsync(object state)
    {
        var uptime = DateTime.Now - _startTime;
        await _client.SetActivityAsync(new Game($"the weather for {uptime.Humanize(2)}", ActivityType.Watching));
    }
}
