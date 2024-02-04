using WeatherGoat.Services;
using WeatherGoat.Exceptions;

namespace WeatherGoat.Modules;

[RequireUserPermission(ChannelPermission.ManageChannels)]
[Group("forecast", "Weather forecast commands")]
public class ForecastModule : InteractionModuleBase<SocketInteractionContext>
{
    private readonly DiscordSocketClient _client;
    private readonly ForecastService     _forecast;
    private readonly LocationService     _location;

    public ForecastModule(DiscordSocketClient client, ForecastService forecast, LocationService location)
    {
        _client   = client;
        _forecast = forecast;
        _location = location;
    }
    
    [SlashCommand("add", "Designates a channel for posting weather forecasts to")]
    public async Task AddForecastDestinationAsync(
        [Summary("latitude", "The latitude of the area")]
        string latitude,
        [Summary("longitude", "The longitude of the area")]
        string longitude,
        [Summary("channel", "The channel in which to send forecasts to")]
        SocketChannel channel,
        [Summary("auto-cleanup", "Whether my messages should be deleted periodically (true by default)")]
        bool cleanup = true)
    {
        if (!_location.IsValidCoordinates(latitude, longitude))
        {
            await RespondAsync("The provided latitude or longitude is is not valid.", ephemeral: true);
            return;
        }

        if (await _client.GetChannelAsync(channel.Id) is not SocketTextChannel chan)
        {
            await RespondAsync("The provided channel is not a text channel.", ephemeral: true);
            return;
        }

        await DeferAsync(ephemeral: true);

        try
        {
            var destination = await _forecast.AddReportDestinationAsync(chan.Id, latitude, longitude, cleanup);
            var message     = "Hourly forecast reporting created!";

            if (cleanup)
            {
                message = $"{message} My messages will be deleted automatically after some time.";
            }
            
            message = $"{message}\nYou can remove this reporting by using the `/forecast remove` command with the GUID `{destination.Id}`.";

            await ModifyOriginalResponseAsync(x => x.Content = message);
        }
        catch (DestinationExistsException)
        {
            await ModifyOriginalResponseAsync(x => x.Content = $"I am already reporting hourly forecasts for that location to {chan.Name}.");
        }
    }

    [SlashCommand("remove", "Removes a forecast reporting destination")]
    private async Task RemoveForecastDestinationAsync(
        [Summary("GUID", "The GUID of the forecast destination to delete")]
        string guid)
    {
        if (!Guid.TryParse(guid, out var parsedGuid))
        {
            await RespondAsync("The GUID you provided is not valid.");
            return;
        }

        await DeferAsync(ephemeral: true);

        try
        {
            await _forecast.RemoveReportDestinationAsync(parsedGuid);
            await ModifyOriginalResponseAsync(x => x.Content = "Alert reporting destination has been successfully removed.");
        }
        catch (DestinationDoesNotExistException)
        {
            await ModifyOriginalResponseAsync(x => x.Content = "An alert destination with that GUID could not be found.");
        }
    }
    
    [SlashCommand("list", "Lists all forecast reporting destinations in this server")]
    private async Task ListForecastDestinationsAsync()
    {
        
    }
}
