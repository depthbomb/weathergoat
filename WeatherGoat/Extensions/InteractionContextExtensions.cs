using Discord;
using Discord.WebSocket;
using WeatherGoat.Common;

namespace WeatherGoat.Extensions;

public static class InteractionContextExtensions
{
    public static InteractionLocation GetInvokedLocation(this IInteractionContext ctx)
    {
        var channelType = ctx.Channel.GetChannelType();
        if (ctx.Guild is SocketGuild && channelType == ChannelType.Text)
        {
            return InteractionLocation.GuildChannel;
        }

        return channelType switch
        {
            ChannelType.Forum         => InteractionLocation.ForumThread,
            ChannelType.NewsThread    => InteractionLocation.ForumThread,
            ChannelType.PublicThread  => InteractionLocation.ForumThread,
            ChannelType.PrivateThread => InteractionLocation.ForumThread,
            ChannelType.DM            => InteractionLocation.DirectMessage,
            ChannelType.Group         => InteractionLocation.GroupChat,
            _                         => InteractionLocation.Unknown
        };
    }
    
    public static async Task RespondWithEmbedAsync(this IInteractionContext ctx, Embed embed, string message = null, bool ephemeral = false)
        => await ctx.Interaction.RespondAsync(text: message, embed: embed, ephemeral: ephemeral);

    public static async Task RespondWithEmbedAsync(this IInteractionContext ctx, EmbedBuilder embedBuilder, string message = null, bool ephemeral = false)
        => await ctx.RespondWithEmbedAsync(embedBuilder.Build(), message, ephemeral);
}
