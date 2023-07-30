using WeatherGoat.Models;

namespace WeatherGoat.Services;

public class ForecastService
{
    private readonly ILogger<ForecastService> _logger;
    private readonly LocationService          _locations;
    private readonly HttpClient               _http;

    public ForecastService(ILogger<ForecastService> logger,
                           IHttpClientFactory       httpFactory,
                           LocationService          locations)
    {
        _logger    = logger;
        _locations = locations;
        _http      = httpFactory.CreateClient("NWS");
    }

    public async Task<ForecastReport> GetCurrentForecastReportAsync(string lat, string lon, CancellationToken ct = default)
    {
        _logger.LogDebug("Request forecast for coordinates {Lat},{Lon}", lat, lon);
        
        var coordinateInfo = await _locations.GetLocationInfoAsync(lat, lon, ct);
        var res            = await _http.GetAsync(coordinateInfo.ForecastUrl, ct);

        res.EnsureSuccessStatusCode();

        var json             = await res.Content.ReadAsStringAsync(ct);
        var data             = JsonSerializer.Deserialize<GridpointForecastGeoJson>(json);
        var periods          = data.Properties.Periods.ToList();
        var forecast         = periods.First();
        var time             = forecast.Name;
        var icon             = forecast.Icon.Replace("medium", "large");
        var shortForecast    = forecast.ShortForecast;
        var detailedForecast = forecast.DetailedForecast;

        return new ForecastReport
        {
            Location         = coordinateInfo.Location,
            Time             = time,
            Icon             = icon,
            ShortForecast    = shortForecast,
            DetailedForecast = detailedForecast,
            RadarImageUrl    = coordinateInfo.RadarImageUrl,
        };
    }
}
