namespace WeatherGoat.Models;

public record ReportLocation
{
    public string Latitude        { get; set; }
    public string Longitude       { get; set; }
    public bool   ReportAlerts    { get; set; }
    public bool   ReportForecast  { get; set; }
    public ulong  AlertChannel    { get; set; }
    public ulong  ForecastChannel { get; set; }

    public (string, string) Coordinates => (Latitude, Longitude);
}
