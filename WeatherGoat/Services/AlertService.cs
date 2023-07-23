using WeatherGoat.Models;

namespace WeatherGoat.Services;

public class AlertService : IDisposable
{
    private readonly ILogger<AlertService> _logger;
    private readonly HttpClient            _http;
    
    public AlertService(ILogger<AlertService> logger, IHttpClientFactory httpFactory)
    {
        _logger = logger;
        _http   = httpFactory.CreateClient("core");
    }

    public async Task<AlertReport?> GetAlertForZoneAsync(string zoneId, CancellationToken cancelToken)
    {
        _logger.LogDebug("Fetching alerts for {Zone}", zoneId);
        
        var res = await _http.GetAsync($"https://api.weather.gov/alerts/active/zone/{zoneId}", cancelToken);
            
        res.EnsureSuccessStatusCode();

        var json = await res.Content.ReadAsStringAsync(cancelToken);
        var data = JsonSerializer.Deserialize<AlertCollectionGeoJson>(json);
        if (!data.Features.Any())
        {
            // Since the return of this method is nullable, it should be clear what returning null means. In this case
            // null means that there aren't any alerts to be found. All other responsibilities (tests, already-reported
            // alerts) should be handled in whatever other services consume this one.

            return null;
        }

        var alert = data.Features.First().Properties;
        return new AlertReport
        {
            Id              = alert.Id,
            Status          = alert.Status,
            Event           = alert.Event,
            AreaDescription = alert.AreaDescription,
            Expires         = alert.Expires,
            Severity        = alert.Severity,
            Certainty       = alert.Certainty,
            Headline        = alert.Headline,
            Description     = alert.Description,
            Instructions    = alert.Instructions
        };
    }
    
    #region IDisposable
    public void Dispose()
    {
        _http.Dispose();
    }
    #endregion
}
