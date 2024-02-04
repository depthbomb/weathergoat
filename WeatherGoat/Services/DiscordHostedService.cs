using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using WeatherGoat.Exceptions;

namespace WeatherGoat.Services;

public class DiscordHostedService : IHostedService, IDisposable
{
    private bool _modulesLoaded;
    
    private readonly ILogger<DiscordHostedService> _logger;
    private readonly IConfiguration                _config;
    private readonly IHostApplicationLifetime      _lifetime;
    private readonly IServiceProvider              _services;
    private readonly DiscordSocketClient           _client;
    private readonly CommandService                _commands;
    private readonly InteractionService            _interactions;

    public DiscordHostedService(
        ILogger<DiscordHostedService> logger,
        IConfiguration                config,
        IHostApplicationLifetime      lifetime,
        IServiceProvider              services,
        DiscordSocketClient           client,
        CommandService                commands,
        InteractionService            interactions
    )
    {
        _logger       = logger;
        _config       = config;
        _lifetime     = lifetime;
        _services     = services;
        _client       = client;
        _commands     = commands;
        _interactions = interactions;

        _client.Log                += ClientOnLog;
        _client.Ready              += ClientOnReady;
        _client.InteractionCreated += ClientOnInteractionCreated;
    }

    #region Implementation of IHostedService
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var token = _config.GetValue<string>("Token");
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogCritical("Missing bot token");
            _lifetime.StopApplication();
        }
        else
        {
            try
            {
                await _client.LoginAsync(TokenType.Bot, token);
                await _client.StartAsync();
                
                _logger.LogInformation("Successfully logged in");
            }
            catch (Exception e)
            {
                if (e is GatewayReconnectException)
                {
                    _logger.LogInformation("Reconnect requested");
                }
                else
                {
                    _logger.LogCritical(e, "An error occurred while logging in");
                    _lifetime.StopApplication();
                }
            }
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Stopping");

        await _client.SetStatusAsync(UserStatus.Invisible);

        await _client.StopAsync();
        await _client.LogoutAsync();
    }
    #endregion
    
    #region Implementation of IDisposable
    public void Dispose()
    {
        _client.Ready -= ClientOnReady;
        
        _client.Dispose();
        _interactions.Dispose();
    }
    #endregion

    private Task ClientOnLog(LogMessage log)
    {
        var    level   = log.Severity;
        string message = log.Message;

        if (!string.IsNullOrEmpty(message))
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
                default:
                case LogSeverity.Info:
                    _logger.LogInformation(message);
                    break;
                case LogSeverity.Debug:
                    _logger.LogDebug(message);
                    break;
                case LogSeverity.Verbose:
                    _logger.LogTrace(message);
                    break;
            }
            // ReSharper restore TemplateIsNotCompileTimeConstantProblem
        }

        return Task.CompletedTask;
    }
    
    private async Task ClientOnReady()
    {
        if (_modulesLoaded)
        {
            return;
        }

        try
        {
            var modules = await _interactions.AddModulesAsync(Assembly.GetEntryAssembly(), _services);
            foreach (var module in modules)
            {
                _logger.LogDebug("Loaded module {Name}", module.Name);
            }

            _modulesLoaded = true;

            var deleteCommandsOption = _config.GetValue<bool>("RemoveCommands");
            if (deleteCommandsOption)
            {
                var commands = await _client.GetGlobalApplicationCommandsAsync();
                foreach (var command in commands)
                {
                    await command.DeleteAsync();

                    _logger.LogInformation("Deleted application command {Command}", command.Name);
                }
            }

            var registerCommandsOption = _config.GetValue<string>("RegisterCommands");
            if (!string.IsNullOrEmpty(registerCommandsOption))
            {
                await _commands.RegisterCommandsAsync(registerCommandsOption == "global");
            }
        }
        catch (Exception e)
        {
            _logger.LogCritical(e, "An error occurred when loading modules");
        }
    }
    
    private async Task ClientOnInteractionCreated(SocketInteraction interaction)
    {
        _logger.LogInformation("Received interaction");
        
        try
        {
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
}
