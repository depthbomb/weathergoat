using Discord.WebSocket;
using WeatherGoat.Models;
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;

namespace WeatherGoat.Services;

public class DispatcherService
{
    private readonly ILogger<DispatcherService>                 _logger;
    private readonly IHostApplicationLifetime                   _lifetime;
    private readonly DiscordSocketClient                        _client;
    private readonly Channel<(ulong, DispatcherMessagePayload)> _channel;
    
    public DispatcherService(ILogger<DispatcherService> logger,
                             IHostApplicationLifetime   lifetime,
                             DiscordSocketClient        client)
    {
        _logger   = logger;
        _lifetime = lifetime;
        _client   = client;
        _channel = Channel.CreateBounded<(ulong, DispatcherMessagePayload)>(new BoundedChannelOptions(10)
        {
            FullMode                      = BoundedChannelFullMode.Wait,
            SingleWriter                  = false,
            SingleReader                  = true,
            AllowSynchronousContinuations = true
        });

        _ = Task.Run(async () => await ProcessDispatcherQueueAsync(), _lifetime.ApplicationStopping);
    }

    public async Task EnqueueMessageAsync(ulong channelId, DispatcherMessagePayload payload)
    {
        await _channel.Writer.WriteAsync((channelId, payload));
        
        _logger.LogDebug("Enqueued message {Payload} to be sent to {ChannelId}", payload, channelId);
    }

    private async Task ProcessDispatcherQueueAsync()
    {
        var ct = _lifetime.ApplicationStopping;
        while (!ct.IsCancellationRequested)
        {
            await foreach (var (channelId, payload) in _channel.Reader.ReadAllAsync(ct))
            {
                if (await _client.GetChannelAsync(channelId) is SocketTextChannel channel)
                {
                    await channel.SendMessageAsync(
                        payload.Text,
                        payload.IsTTS,
                        payload.Embed,
                        payload.Options,
                        payload.AllowedMentions,
                        payload.MessageReference,
                        payload.Components,
                        payload.Stickers,
                        payload.Embeds,
                        payload.Flags
                    );

                    await Task.Delay(500, ct);
                }
            }
        }
    }
}
