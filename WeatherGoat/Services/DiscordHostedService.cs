using Discord;
using Humanizer;
using Discord.WebSocket;
using System.Reflection;
using Discord.Interactions;
using Microsoft.Extensions.Hosting;
using WeatherGoat.Shared.Extensions;
using Microsoft.Extensions.Configuration;

namespace WeatherGoat.Services;

public class DiscordHostedService : IHostedService, IDisposable
{
    private bool  _modulesLoaded;
    private Timer _activityUpdateTimer;

    private readonly ILogger<DiscordHostedService> _logger;
    private readonly IConfiguration                _config;
    private readonly IHostApplicationLifetime      _lifetime;
    private readonly IServiceProvider              _services;
    private readonly DiscordSocketClient           _client;
    private readonly InteractionService            _interactions;
    private readonly CommandsService               _commands;
    private readonly DateTime                      _startTime;

    public DiscordHostedService(
        ILogger<DiscordHostedService> logger,
        IConfiguration                config,
        IHostApplicationLifetime      lifetime,
        IServiceProvider              services,
        DiscordSocketClient           client,
        InteractionService            interactions,
        CommandsService               commands)
    {
        _logger       = logger;
        _config       = config;
        _lifetime     = lifetime;
        _services     = services;
        _client       = client;
        _interactions = interactions;
        _commands     = commands;
        _startTime    = DateTime.Now;

        _client.Log                += ClientOnLog;
        _client.Ready              += ClientOnReady;
        _client.Disconnected       += ClientOnDisconnected;
        _client.InteractionCreated += ClientOnInteractionCreated;
    }

    #region Implementation of IHostedService
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var token = Environment.GetEnvironmentVariable("TOKEN") ?? _config.GetValue<string>("token");
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
        if (!_modulesLoaded)
        {
            try
            {
                var modules = await _interactions.AddModulesAsync(Assembly.GetEntryAssembly(), _services);
                foreach (var module in modules)
                {
                    _logger.LogDebug("Module {Name} loaded", module.Name);
                }

                _modulesLoaded = true;

                var registerCommandsOption = _config.GetValue<string>("register-commands");
                if (!string.IsNullOrEmpty(registerCommandsOption))
                {
                    await _commands.RegisterCommandsAsync(registerCommandsOption == "globally");
                }
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Error occurred in Ready handler");
            }
        }
        
        await _client.SetStatusAsync(UserStatus.DoNotDisturb);
    }
    
    private async Task ClientOnInteractionCreated(SocketInteraction interaction)
    {
        try
        {
            _logger.LogInformation("Received interaction");

            if (interaction is SocketSlashCommand)
            {
                await interaction.Channel.TriggerTypingAsync();
            }

            var ctx = new SocketInteractionContext(_client, interaction);
            await _interactions.ExecuteCommandAsync(ctx, _services);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Error in InteractionCreated handler");

            await interaction.RespondAsync("Whoops! It appears you tried to execute a command that I cannot handle. You should report this to my creator.");
        }
        finally
        {
            _logger.LogInformation("Finished interaction");
        }
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
