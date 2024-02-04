namespace WeatherGoat.Extensions;

public static class DiscordSocketClientExtensions
{
    public static async Task<SocketTextChannel?> GetTextChannelAsync(this DiscordSocketClient client, ulong channelId) 
        => await client.GetChannelAsync(channelId) as SocketTextChannel;
}
