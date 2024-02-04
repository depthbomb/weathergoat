using Discord.Webhook;

namespace WeatherGoat.Services;

public class WebhookService
{
    private readonly ILogger<WebhookService> _logger;
    private readonly DiscordSocketClient     _client;

    public WebhookService(ILogger<WebhookService> logger, DiscordSocketClient client)
    {
        _logger = logger;
        _client = client;
    }

    public async Task<DiscordWebhookClient> GetOrCreateAsync(ulong channelId, string webhookName, string? reason = null)
    {
        var channel = await _client.GetTextChannelAsync(channelId);
        if (channel == null)
        {
            throw new Exception($"Could not retrieve channel {channelId}");
        }

        var webhooks   = await channel.GetWebhooksAsync();
        var ourWebhook = webhooks.FirstOrDefault(x => x.Name == webhookName);
        if (ourWebhook == null)
        {
            _logger.LogInformation("Creating \"{Name}\" webhook for channel {ChannelName} ({ChannelId})", webhookName, channel.Name, channelId);

            var webhookOptions = new RequestOptions();
            if (reason != null)
            {
                webhookOptions.AuditLogReason = reason;
            }

            ourWebhook = await channel.CreateWebhookAsync(webhookName, options: webhookOptions);
        }

        return new DiscordWebhookClient(ourWebhook.Id, ourWebhook.Token);
    }
}
