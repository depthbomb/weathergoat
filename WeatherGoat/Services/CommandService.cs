namespace WeatherGoat.Services;

public class CommandService
{
    private readonly ILogger<CommandService> _logger;
    private readonly DiscordSocketClient     _client;
    private readonly InteractionService      _interactions;

    public CommandService(ILogger<CommandService> logger, DiscordSocketClient client, InteractionService interactions)
    {
        _logger       = logger;
        _client       = client;
        _interactions = interactions;
    }
    
    public async Task RegisterCommandsAsync(bool globally = false)
    {
        if (globally)
        {
            _logger.LogInformation("Registering commands globally");

            var commands = await _interactions.RegisterCommandsGloballyAsync();
            foreach (var command in commands)
            {
                _logger.LogInformation("Registered command {Name}", command.Name);
            }
        }
        else
        {
            var guilds = _client.Guilds;
            if (guilds.Count != 0)
            {
                _logger.LogInformation("Registering commands locally to {Count} guild(s)", guilds.Count);

                foreach (var guild in guilds)
                {
                    var commands = await _interactions.RegisterCommandsToGuildAsync(guild.Id);
                    foreach (var command in commands)
                    {
                        _logger.LogInformation("Registered command {Name} in guild {Id}", command.Name, guild.Name);
                    }
                }
            }
            else
            {
                _logger.LogInformation("No guilds to register commands to");
            }
        }
    }
}
