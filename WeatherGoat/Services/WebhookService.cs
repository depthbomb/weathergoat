using Discord;
using Discord.Webhook;
using Discord.WebSocket;

namespace WeatherGoat.Services;

public class WebhookService
{
    private const string WebhookName = "WeatherGoat Webhook Integration";
    
    private readonly ILogger<WebhookService> _logger;
    private readonly DiscordSocketClient     _client;

    public WebhookService(
        ILogger<WebhookService> logger,
        DiscordSocketClient     client)
    {
        _logger = logger;
        _client = client;
    }

    public async Task<DiscordWebhookClient> GetWebhookAsync(ITextChannel channel)
    {
        var webhooks   = await channel.GetWebhooksAsync();
        var ourWebhook = webhooks.FirstOrDefault(x => x.Name == WebhookName);
        if (ourWebhook != null)
        {
            return new DiscordWebhookClient(ourWebhook);
        }

        return await CreateWebhookAsync(channel);
    }

    public async Task<DiscordWebhookClient> CreateWebhookAsync(ITextChannel channel)
    {
        var webhook = await channel.CreateWebhookAsync(WebhookName);
        
        _logger.LogInformation("Created webhook {Id} in channel {ChannelId}", webhook.Id, channel.Id);

        return new DiscordWebhookClient(webhook);
    }

    public async Task<ulong> SendWebhookMessageAsync(ITextChannel channel, string content, Embed embed)
    {
        var webhook = await GetWebhookAsync(channel);

        return await webhook.SendMessageAsync(
            content,
            embeds: new []
            {
                embed
            },
            username: _client.CurrentUser.Username,
            avatarUrl: _client.CurrentUser.GetAvatarUrl(ImageFormat.WebP, 1024)
        );
    }
}
