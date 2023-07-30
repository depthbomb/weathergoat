using Discord;

namespace WeatherGoat.Extensions;

public static class UserExtensions
{
    public static string GetTag(this IUser user) => $"{user.Username}#{user.Discriminator}";
}
