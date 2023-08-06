using Discord;
using WeatherGoat.Models;

namespace WeatherGoat.Services;

public class AlertService : IDisposable
{
    private readonly ILogger<AlertService> _logger;
    private readonly LocationService       _locations;
    private readonly HttpClient            _http;
    
    public AlertService(ILogger<AlertService> logger, IHttpClientFactory httpFactory, LocationService locations)
    {
        _logger    = logger;
        _locations = locations;
        _http      = httpFactory.CreateClient("NWS");
    }

    public async Task<IReadOnlyList<AlertReport>> GetAlertsForLocationAsync(
        string            latitude,
        string            longitude,
        CancellationToken ct = default)
    {
        _logger.LogDebug("Fetching alerts for {Lat},{Lon}", latitude, longitude);

        var alertReports   = new List<AlertReport>();
        var coordinateInfo = await _locations.GetLocationInfoAsync(latitude, longitude, ct);
        var res            = await _http.GetAsync($"/alerts/active/zone/{coordinateInfo.ZoneId}", ct);

        res.EnsureSuccessStatusCode();

        var json = await res.Content.ReadAsStringAsync(ct);
        var data = JsonSerializer.Deserialize<AlertCollectionJsonLd>(json);
        if (data == null || data.Alerts.Count == 0)
        {
            return alertReports;
        }

        alertReports.AddRange(data.Alerts.Select(alert => new AlertReport
        {
            Id              = alert.Id,
            IsUpdate        = alert.MessageType == AlertMessageType.Update,
            Status          = alert.Status,
            Event           = alert.Event,
            AreaDescription = alert.AreaDescription,
            Expires         = alert.Expires,
            Severity        = alert.Severity,
            Certainty       = alert.Certainty,
            Headline        = alert.Headline,
            Description     = alert.Description,
            Instructions    = alert.Instructions,
            RadarImageUrl   = coordinateInfo.RadarImageUrl
        }));

        return alertReports.AsReadOnly();
    }

    #region IDisposable
    public void Dispose()
    {
        _http.Dispose();
    }
    #endregion

    public Color GetSeverityColor(AlertSeverity severity) =>
        severity switch
        {
            AlertSeverity.Extreme  => Color.DarkRed,
            AlertSeverity.Severe   => Color.Red,
            AlertSeverity.Moderate => Color.Orange,
            AlertSeverity.Minor    => Color.Gold,
            _                      => Color.Blue
        };
}
