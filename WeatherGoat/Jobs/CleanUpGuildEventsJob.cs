using Quartz;

namespace WeatherGoat.Jobs;

public class CleanUpGuildEventsJob : IJob
{
    private readonly ILogger<CleanUpGuildEventsJob> _logger;
    private readonly DiscordSocketClient            _client;

    public CleanUpGuildEventsJob(ILogger<CleanUpGuildEventsJob> logger, DiscordSocketClient client)
    {
        _logger = logger;
        _client = client;
    }
    
    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var guilds = _client.Guilds;
        if (guilds.Count == 0)
        {
            return;
        }
        
        foreach (var guild in guilds)
        {
            var events = guild.Events;
            if (events.Count == 0)
            {
                continue;
            }

            var now = DateTime.Now;
            foreach (var guildEvent in events.Where(x => x.Creator.Id == _client.CurrentUser.Id && x.EndTime <= now))
            {
                await guildEvent.EndAsync();
                await guildEvent.DeleteAsync();
                
                _logger.LogInformation("Deleted event \"{EventName}\" in guild {GuildName}", guildEvent.Name, guild.Name);
            }
        }
    }
    #endregion
}
