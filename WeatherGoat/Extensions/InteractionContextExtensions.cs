using WeatherGoat.Common;
using WeatherGoat.Exceptions;

namespace WeatherGoat.Extensions;

public static class InteractionContextExtensions
{
    public static async Task RespondWithEmbedAsync(this IInteractionContext ctx, Embed embed, bool ephemeral = false)
    {
        if (ctx.Interaction.HasResponded)
        {
            await ctx.Interaction.ModifyOriginalResponseAsync(x => x.Embed = embed);
        }
        else
        {
            await ctx.Interaction.RespondAsync(embed: embed, ephemeral: ephemeral);
        }
    }

    public static async Task RespondWithEmbedAsync(this IInteractionContext ctx, EmbedBuilder embed, bool ephemeral = false) 
        => await ctx.RespondWithEmbedAsync(embed: embed.Build(), ephemeral);

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
}
