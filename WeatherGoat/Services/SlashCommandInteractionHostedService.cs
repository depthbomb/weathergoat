using WeatherGoat.Common;
using WeatherGoat.Exceptions;
using Microsoft.Extensions.Hosting;

namespace WeatherGoat.Services;

public class SlashCommandInteractionHostedService : IHostedService
{
    private readonly ILogger<SlashCommandInteractionHostedService> _logger;
    private readonly InteractionService                            _interactions;

    public SlashCommandInteractionHostedService(ILogger<SlashCommandInteractionHostedService> logger,
                                                InteractionService                            interactions)
    {
        _logger       = logger;
        _interactions = interactions;
    }
    
    #region Implementation of IHostedService
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _interactions.SlashCommandExecuted += InteractionsOnSlashCommandExecuted;

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _interactions.SlashCommandExecuted -= InteractionsOnSlashCommandExecuted;

        return Task.CompletedTask;
    }
    #endregion
    
    private async Task InteractionsOnSlashCommandExecuted(SlashCommandInfo cmd, IInteractionContext ctx, IResult res)
    {
        var invoker = ctx.User;
        var location = ctx.GetInvokedLocation() switch
        {
            InteractionLocation.DirectMessage => "DMs",
            InteractionLocation.ForumThread   => (ctx.Channel as SocketThreadChannel)?.Name,
            InteractionLocation.GroupChat     => "a group chat",
            InteractionLocation.GuildChannel  => $"{ctx.Guild.Name}#{ctx.Channel.Name}",
            _                                 => $"??? ({ctx.Channel.Id})"
        };

        _logger.LogInformation("{User} executed {Command} in {Location}", invoker.Username, $"{cmd.Module.Name}#{cmd.MethodName}", location);

        if (res.IsSuccess)
        {
            return;
        }
        
        switch (res.Error)
        {
            case InteractionCommandError.Exception:
                var e = ((ExecuteResult)res).Exception;
                if (e is CommandArgumentException)
                {
                    await ctx.Interaction.RespondAsync(e.Message);
                }
                else
                {
                    _logger.LogError(e, "Error in interaction execution: {Reason}", res.ErrorReason);
                }
                break;
            case InteractionCommandError.Unsuccessful:
                Console.WriteLine("Interaction unsuccessful?");
                break;
            case InteractionCommandError.UnknownCommand:
                _logger.LogError("Interaction {Command} failed: {Reason}", cmd.Name, res.ErrorReason);
                break;
            case InteractionCommandError.UnmetPrecondition:
                _logger.LogWarning("Interaction {Command} failed due to an unmet precondition: {Reason}", cmd.Name, res.ErrorReason);
                break;
            case InteractionCommandError.BadArgs:
            case InteractionCommandError.ConvertFailed:
                await ctx.Interaction.RespondAsync("One or more of the command arguments you provided is not valid.");
                break;
            case InteractionCommandError.ParseFailed:
                Console.WriteLine("InteractionCommandError.ParseFailed");
                break;
            default:
                Console.WriteLine("Interaction failed?");
                break;
        }
    }
}
