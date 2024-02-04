using WeatherGoat.Data;
using WeatherGoat.Models;
using System.Net.Http.Json;
using WeatherGoat.Exceptions;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Services;

public class ForecastService
{
    private readonly ILogger<ForecastService>        _logger;
    private readonly IDbContextFactory<AppDbContext> _contextFactory;
    private readonly LocationService                 _location;
    private readonly HttpClient                      _http;

    public ForecastService(ILogger<ForecastService>        logger,
                           IDbContextFactory<AppDbContext> contextFactory,
                           IHttpClientFactory              httpFactory,
                           LocationService                 location)
    {
        _logger         = logger;
        _contextFactory = contextFactory;
        _location       = location;
        _http           = httpFactory.CreateClient("NWS");
    }

    public async Task<GridpointForecastPeriod> GetForCoordinatesAsync(string latitude, string longitude, CancellationToken ct = default)
    {
        _logger.LogInformation("Retrieving forecast for {Lat},{Lon}", latitude, longitude);
        
        var locationInfo = await _location.GetInfoAsync(latitude, longitude, ct);
        var res          = await _http.GetAsync(locationInfo.ForecastUrl, ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new Exception($"Request to {locationInfo.ForecastUrl} failed: {res.ReasonPhrase}");
        }

        var data = await res.Content.ReadFromJsonAsync<GridpointForecast>(ct);
        if (data == null)
        {
            throw new Exception("Failed to deserialize response JSON body");
        }

        return data.Periods[0];
    }
    
    public async Task<ForecastDestination> AddReportDestinationAsync(ulong channelId, string latitude, string longitude, bool cleanup)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var exists = await db.ForecastDestinations.FirstOrDefaultAsync(x =>
            x.Latitude  == latitude  &&
            x.Longitude == longitude &&
            x.ChannelId == channelId) != null;
        if (exists)
        {
            throw new DestinationExistsException();
        }

        var coordinateInfo = await _location.GetInfoAsync(latitude, longitude);
        var destination = new ForecastDestination
        {
            Latitude      = latitude,
            Longitude     = longitude,
            ChannelId     = channelId,
            AutoCleanup   = cleanup,
            RadarImageUrl = coordinateInfo.RadarImageUrl
        };
        
        await db.ForecastDestinations.AddAsync(destination);
        await db.SaveChangesAsync();

        return destination;
    }
    
    public async Task RemoveReportDestinationAsync(Guid guid)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var destination = await db.ForecastDestinations.FirstOrDefaultAsync(x => x.Id == guid);
        if (destination == null)
        {
            throw new DestinationDoesNotExistException();
        }

        db.ForecastDestinations.Remove(destination);

        await db.SaveChangesAsync();
    }
}
