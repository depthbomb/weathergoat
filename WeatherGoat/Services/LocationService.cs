using WeatherGoat.Data;
using WeatherGoat.Models;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Services;

public class LocationService : IDisposable
{
    private readonly ILogger<LocationService> _logger;
    private readonly IServiceScopeFactory     _scopeFactory;
    private readonly HttpClient               _http;

    public LocationService(ILogger<LocationService> logger,
                           IServiceScopeFactory     scopeFactory,
                           IHttpClientFactory       httpFactory)
    {
        _logger       = logger;
        _scopeFactory = scopeFactory;
        _http         = httpFactory.CreateClient("NWS");
    }

    public async Task<CoordinateInfo> GetLocationInfoAsync(string latitude, string longitude, CancellationToken ct = default)
    {
        await using (var scope = _scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            
            _logger.LogDebug("Retrieving coordinate info for {Lat},{Lon}", latitude, longitude);

            var record = await db.CoordinateInfo.FirstOrDefaultAsync(r => r.Latitude == latitude && r.Longitude == longitude, cancellationToken: ct);
            if (record != null)
            {
                _logger.LogDebug("Using cached data");
            
                return record;
            }

            _logger.LogDebug("Requesting coordinate info from API");

            var endpointUrl = $"/points/{latitude},{longitude}";
            var res         = await _http.GetAsync(endpointUrl, ct);
            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Failed to retrieve coordinate info from {endpointUrl} - {res.ReasonPhrase}");
            }

            var json        = await res.Content.ReadAsStringAsync(ct);
            var point       = JsonSerializer.Deserialize<PointJsonLd>(json);
            var location    = point.RelativeLocation;
            var forecastUrl = point.ForecastUrl;

            record = new CoordinateInfo
            {
                Latitude      = latitude,
                Longitude     = longitude,
                Location      = location.CityAndState,
                ZoneId        = point.ZoneId,
                CountyId      = point.CountyId,
                ForecastUrl   = forecastUrl,
                RadarImageUrl = point.RadarImageLoopUrl,
            };
            
            await db.CoordinateInfo.AddAsync(record, ct);
            await db.SaveChangesAsync(ct);

            return record;
        }
    }

    #region IDisposable
    /// <inheritdoc />
    public void Dispose() { }
    #endregion
}
