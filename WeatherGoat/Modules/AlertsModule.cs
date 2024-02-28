using WeatherGoat.Services;
using WeatherGoat.Exceptions;

namespace WeatherGoat.Modules;

[RequireUserPermission(ChannelPermission.ManageChannels)]
[Group("alert", "Weather alert commands")]
public class AlertsModule : InteractionModuleBase<SocketInteractionContext>
{
    private readonly DiscordSocketClient _client;
    private readonly AlertsService       _alerts;
    private readonly LocationService     _location;

    public AlertsModule(DiscordSocketClient client, AlertsService alerts, LocationService location)
    {
        _client   = client;
        _alerts   = alerts;
        _location = location;
    }

    [SlashCommand("add", "Designates a channel for posting weather alerts to")]
    public async Task AddAlertDestinationAsync(
        [Summary("latitude", "The latitude of the area to check for active alerts")]
        string latitude,
        [Summary("longitude", "The longitude of the area to check for active alerts")]
        string longitude,
        [Summary("channel", "The channel in which to send alerts to")]
        SocketChannel channel,
        [Summary("auto-cleanup", "Whether my messages should be deleted periodically (true by default)")]
        bool cleanup = true,
        [Summary("ping-on-severe", "Whether to ping everyone when a severe or extreme alert is posted (false by default)")]
        bool pingOnSevere = true)
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
            var destination = await _alerts.AddReportDestinationAsync(chan.Id, latitude, longitude, cleanup, pingOnSevere);
            var message     = "Alert reporting created!";

            if (cleanup)
            {
                message = $"{message} My messages will be deleted automatically after some time.";
            }

            if (pingOnSevere)
            {
                message = $"{message}\nI will ping everyone in the server if there is a severe or extreme alert.";
            }
            
            message = $"{message}\nYou can remove this reporting by using the `/alert remove` command with the GUID `{destination.Id}`.";

            await ModifyOriginalResponseAsync(x => x.Content = message);
        }
        catch (DestinationExistsException)
        {
            await ModifyOriginalResponseAsync(x => x.Content = $"I am already reporting alerts for that location to {chan.Name}.");
        }
    }

    [SlashCommand("remove", "Removes an alert reporting destination")]
    private async Task RemoveAlertDestinationAsync(
        [Summary("GUID", "The GUID of the alert destination to delete")]
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
            await _alerts.RemoveReportDestinationAsync(parsedGuid);
            await ModifyOriginalResponseAsync(x => x.Content = "Alert reporting destination has been successfully removed.");
        }
        catch (DestinationDoesNotExistException)
        {
            await ModifyOriginalResponseAsync(x => x.Content = "An alert destination with that GUID could not be found.");
        }
    }

    [SlashCommand("list", "Lists all alert reporting destinations in this server")]
    private async Task ListAlertDestinationsAsync()
    {
        
    }
}
