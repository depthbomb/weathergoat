using WeatherGoat.Data;
using WeatherGoat.Models;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Services;

public class ForecastService : IDisposable
{
    private readonly ILogger<ForecastService> _logger;
    private readonly IServiceScopeFactory     _scopeFactory;
    private readonly HttpClient               _http;

    public ForecastService(ILogger<ForecastService> logger,
                           IServiceScopeFactory     scopeFactory,
                           IHttpClientFactory       httpFactory)
    {
        _logger       = logger;
        _scopeFactory = scopeFactory;
        _http         = httpFactory.CreateClient("NWS");
    }

    public async Task<ForecastReport> GetCurrentForecastReportAsync(string lat, string lon, CancellationToken cancelToken)
    {
        _logger.LogDebug("Request forecast for coordinates {Lat},{Lon}", lat, lon);
        
        var (location, forecastUrl) = await GetInfoFromCoordinates(lat, lon, cancelToken);
        
        var res = await _http.GetAsync(forecastUrl, cancelToken);
        if (!res.IsSuccessStatusCode)
        {
            throw new Exception($"Failed to get forecast data from {forecastUrl} - {res.ReasonPhrase}");
        }
        
        var json             = await res.Content.ReadAsStringAsync(cancelToken);
        var data             = JsonSerializer.Deserialize<GridpointForecastGeoJson>(json);
        var periods          = data.Properties.Periods.ToList();
        var forecast         = periods.First();
        var time             = forecast.Name;
        var icon             = forecast.Icon.Replace("medium", "large");
        var shortForecast    = forecast.ShortForecast;
        var detailedForecast = forecast.DetailedForecast;

        return new ForecastReport
        {
            Location         = location,
            Time             = time,
            Icon             = icon,
            ShortForecast    = shortForecast,
            DetailedForecast = detailedForecast
        };
    }
    
    #region IDisposable
    public void Dispose()
    {
        _http.Dispose();
    }
    #endregion
    
    private async Task<(string, string)> GetInfoFromCoordinates(string latitude, string longitude, CancellationToken ct)
    {
        await using (var scope = _scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            
            _logger.LogDebug("Retrieving coordinate info for {Lat},{Lon}", latitude, longitude);

            var record = await db.CoordinateInfo.FirstOrDefaultAsync(r => r.Latitude == latitude && r.Longitude == longitude, cancellationToken: ct);
            if (record != null)
            {
                _logger.LogDebug("Using cached data");
            
                return (record.Location, record.ForecastUrl);
            }

            _logger.LogDebug("Requesting coordinate info from API");

            var endpointUrl = $"/points/{latitude},{longitude}";
            var res         = await _http.GetAsync(endpointUrl, ct);
            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Failed to retrieve coordinate info from {endpointUrl} - {res.ReasonPhrase}");
            }

            var json = await res.Content.ReadAsStringAsync(ct);

            var data               = JsonSerializer.Deserialize<PointGeoJson>(json);
            var location           = data.Properties.RelativeLocation.Properties;
            var cityName           = location.City;
            var stateName          = location.State;
            var coordinateLocation = $"{cityName}, {stateName}";
            var forecastUrl        = data.Properties.Forecast;

            await db.CoordinateInfo.AddAsync(new CoordinateInfo
            {
                Latitude    = latitude,
                Longitude   = longitude,
                Location    = coordinateLocation,
                ForecastUrl = forecastUrl
            }, ct);

            await db.SaveChangesAsync(ct);

            return (coordinateLocation, forecastUrl);
        }
    }
}
