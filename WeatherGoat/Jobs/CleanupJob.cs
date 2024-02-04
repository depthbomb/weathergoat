using Quartz;
using WeatherGoat.Data;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Jobs;

public class CleanupJob : IJob
{
    private readonly ILogger<CleanupJob>             _logger;
    private readonly IDbContextFactory<AppDbContext> _contextFactory;
    private readonly DiscordSocketClient             _client;

    public CleanupJob(ILogger<CleanupJob> logger, IDbContextFactory<AppDbContext> contextFactory, DiscordSocketClient client)
    {
        _logger         = logger;
        _contextFactory = contextFactory;
        _client         = client;
    }

    #region Implementation of IJob
    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;

        await using var db = await _contextFactory.CreateDbContextAsync(ct);

        var volatileMessages = await db.VolatileMessages.Where(x => x.ExpiresAt <= DateTime.Now).ToListAsync(ct);
        foreach (var vm in volatileMessages)
        {
            var channelId = vm.ChannelId;
            var messageId = vm.MessageId;
            if (await _client.GetChannelAsync(channelId) is SocketTextChannel channel)
            {
                var message = await channel.GetMessageAsync(messageId);
                if (message == null)
                {
                    _logger.LogError("Could not retrieve message {MessageId} in channel {Channel}", messageId, channel.Name);
                }
                else
                {
                    await message.DeleteAsync();
                }
            }

            db.VolatileMessages.Remove(vm);
        }

        await db.SaveChangesAsync(ct);
    }
    #endregion
}
