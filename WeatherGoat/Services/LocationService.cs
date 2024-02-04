using WeatherGoat.Models;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace WeatherGoat.Services;

public class LocationService
{
    private readonly ILogger<LocationService> _logger;
    private readonly IMemoryCache             _cache;
    private readonly HttpClient               _http;
    private readonly Regex                    _latitudePattern;
    private readonly Regex                    _longitudePattern;

    public LocationService(ILogger<LocationService> logger, IMemoryCache cache, IHttpClientFactory httpFactory)
    {
        _logger           = logger;
        _cache            = cache;
        _http             = httpFactory.CreateClient("NWS");
        _latitudePattern  = new Regex(@"^(\+|-)?(?:90(?:(?:\.0{1,6})?)|(?:[0-9]|[1-8][0-9])(?:(?:\.[0-9]{1,6})?))$", RegexOptions.Compiled);
        _longitudePattern = new Regex(@"^(\+|-)?(?:180(?:(?:\.0{1,6})?)|(?:[0-9]|[1-9][0-9]|1[0-7][0-9])(?:(?:\.[0-9]{1,6})?))$", RegexOptions.Compiled);
    }

    public async Task<CoordinateInfo> GetInfoAsync(string latitude, string longitude, CancellationToken ct = default)
    {
        _logger.LogDebug("Retrieving coordinate info for {Lat},{Lon}", latitude, longitude);

        var cacheKey = $"{latitude},{longitude}";
        if (_cache.TryGetValue<CoordinateInfo>(cacheKey, out var cachedCoordinateInfo))
        {
            _logger.LogDebug("Using cached data");

            return cachedCoordinateInfo;
        }
        
        _logger.LogDebug("Cache miss, retrieving info from API");

        var res = await _http.GetAsync($"/points/{latitude},{longitude}", ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new Exception(res.ReasonPhrase);
        }

        var data = await res.Content.ReadFromJsonAsync<Point>(ct);

        var coordinateInfo = new CoordinateInfo
        {
            Latitude      = latitude,
            Longitude     = longitude,
            Location      = data.RelativeLocation.CityState,
            ZoneId        = data.ZoneId,
            CountyId      = data.CountyId,
            ForecastUrl   = data.Forecast,
            RadarImageUrl = data.RadarImageUrl
        };

        _cache.Set(cacheKey, coordinateInfo);

        return coordinateInfo;
    }

    public bool IsValidCoordinates(string coordinates)
    {
        try
        {
            var split     = coordinates.Split(',');
            var latitude  = split[0].Trim();
            var longitude = split[1].Trim();

            return IsValidCoordinates(latitude, longitude);
        }
        catch
        {
            return false;
        }
    }
    
    public bool IsValidCoordinates(string latitude, string longitude) => IsValidLatitude(latitude) && IsValidLongitude(longitude);
    public bool IsValidLatitude(string latitude) => _latitudePattern.IsMatch(latitude);
    public bool IsValidLongitude(string longitude) => _longitudePattern.IsMatch(longitude);
}
