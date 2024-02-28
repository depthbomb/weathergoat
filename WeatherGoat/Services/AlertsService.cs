using WeatherGoat.Data;
using WeatherGoat.Models;
using System.Net.Http.Json;
using WeatherGoat.Exceptions;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Services;

public class AlertsService
{
    private readonly ILogger<AlertsService>          _logger;
    private readonly IDbContextFactory<AppDbContext> _contextFactory;
    private readonly LocationService                 _location;
    private readonly HttpClient                      _http;

    public AlertsService(ILogger<AlertsService>          logger,
                         IDbContextFactory<AppDbContext> contextFactory,
                         IHttpClientFactory              httpFactory,
                         LocationService                 location)
    {
        _logger         = logger;
        _contextFactory = contextFactory;
        _location       = location;
        _http           = httpFactory.CreateClient("NWS");
    }

    public async Task<IReadOnlyList<Alert>> GetActiveAsync(CancellationToken ct = default)
    {
        _logger.LogDebug("Retrieving all active alerts");

        var res = await _http.GetAsync("/alerts/active", ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new Exception($"Failed to retrieve active alerts: {res.ReasonPhrase}");
        }

        var data = await res.Content.ReadFromJsonAsync<AlertCollection>(ct);
        if (data == null)
        {
            throw new Exception("Failed to deserialize response JSON body");
        }

        return data.Alerts;
    }

    public async Task<IReadOnlyList<Alert>> GetActiveForZoneAsync(string zoneId, string? countyId = null, CancellationToken ct = default)
    {
        _logger.LogDebug("Retrieving active alerts for zones {Zones} and counties {Counties}", zoneId, countyId);

        var ids = new List<string> { zoneId };
        if (countyId != null)
        {
            ids.Add(countyId);
        }

        var queryString = ids.ToQueryStringArray("zone");
        var res         = await _http.GetAsync($"/alerts/active?{queryString}", ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new Exception($"Failed to retrieve alerts for zones {ids}: {res.ReasonPhrase}");
        }

        var data = await res.Content.ReadFromJsonAsync<AlertCollection>(ct);
        if (data == null)
        {
            throw new Exception("Failed to deserialize response JSON body");
        }

        return data.Alerts;
    }

    public async Task<AlertDestination> AddReportDestinationAsync(ulong channelId, string latitude, string longitude, bool cleanup, bool pingOnSevere)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var exists = await db.AlertDestinations.FirstOrDefaultAsync(x =>
            x.Latitude  == latitude  &&
            x.Longitude == longitude &&
            x.ChannelId == channelId) != null;
        if (exists)
        {
            throw new DestinationExistsException();
        }

        var coordinateInfo = await _location.GetInfoAsync(latitude, longitude);
        var destination = new AlertDestination
        {
            Latitude              = latitude,
            Longitude             = longitude,
            ZoneId                = coordinateInfo.ZoneId,
            CountyId              = coordinateInfo.CountyId,
            ChannelId             = channelId,
            AutoCleanup           = cleanup,
            PingOnSevereOrExtreme = pingOnSevere,
            RadarImageUrl         = coordinateInfo.RadarImageUrl
        };
        
        await db.AlertDestinations.AddAsync(destination);
        await db.SaveChangesAsync();

        return destination;
    }

    public async Task RemoveReportDestinationAsync(Guid guid)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var destination = await db.AlertDestinations.FirstOrDefaultAsync(x => x.Id == guid);
        if (destination == null)
        {
            throw new DestinationDoesNotExistException();
        }

        db.AlertDestinations.Remove(destination);

        await db.SaveChangesAsync();
    }
}
