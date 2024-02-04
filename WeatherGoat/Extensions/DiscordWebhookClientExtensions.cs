using Discord.Webhook;

namespace WeatherGoat.Extensions;

public static class DiscordWebhookClientExtensions
{
    public static async Task<ulong> SendEmbedAsync(this DiscordWebhookClient webhook, Embed embed) 
        => await webhook.SendMessageAsync(embeds: [embed]);
    
    public static async Task<ulong> SendEmbedAsync(this DiscordWebhookClient webhook, EmbedBuilder embedBuilder) 
        => await webhook.SendMessageAsync(embeds: [embedBuilder.Build()]);
}
