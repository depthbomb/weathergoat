using Quartz;
using Discord;
using Discord.WebSocket;
using Microsoft.Extensions.Configuration;

namespace WeatherGoat.Jobs;

public class CleanupJob : IJob
{
    private readonly ILogger<CleanupJob> _logger;
    private readonly DiscordSocketClient _client;
    private readonly IList<ulong>        _channels;

    public CleanupJob(ILogger<CleanupJob> logger, IConfiguration config, DiscordSocketClient client)
    {
        _logger   = logger;
        _client   = client;
        _channels = config.GetSection("Cleanup:Channels").Get<List<ulong>>();
    }
    
    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var cancelToken = context.CancellationToken;
        foreach (ulong channelId in _channels)
        {
            var chan = await _client.GetChannelAsync(channelId);
            if (chan is not SocketTextChannel channel)
            {
                continue;
            }
            
            var messages = await channel.GetMessagesAsync().FlattenAsync();
            
            _logger.LogInformation("Cleaning up {Count} messages in {Channel}", messages.Count(), channel.Name);

            try
            {
                await channel.DeleteMessagesAsync(messages);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Unable to delete messages from {Channel}", channel.Name);
            }
            finally
            {
                await Task.Delay(500, cancelToken);
            }
        }
    }
    #endregion
}
