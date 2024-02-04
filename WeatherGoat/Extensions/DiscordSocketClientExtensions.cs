namespace WeatherGoat.Extensions;

public static class DiscordSocketClientExtensions
{
    public static async Task<SocketTextChannel?> GetTextChannelAsync(this DiscordSocketClient client, ulong channelId) 
        => await client.GetChannelAsync(channelId) as SocketTextChannel;

    public static async Task<SocketMessage?> GetMessageAsync(this DiscordSocketClient client, ulong channelId, ulong messageId)
    {
        if (await client.GetChannelAsync(channelId) is not SocketTextChannel channel)
        {
            return null;
        }

        if (await channel.GetMessageAsync(messageId) is not SocketMessage message)
        {
            return null;
        }

        return message;
    }
}
