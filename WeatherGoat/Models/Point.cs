namespace WeatherGoat.Models;

public record Point
{
    [JsonPropertyName("forecast")]
    public string Forecast { get; set; }
	
    [JsonPropertyName("relativeLocation")]
    public RelativeLocationGeoJson RelativeLocation { get; set; }
    
    [JsonPropertyName("forecastZone")]
    public string ForecastZone { get; set; }
    
    [JsonPropertyName("county")]
    public string County { get; set; }
    
    [JsonPropertyName("radarStation")]
    public string RadarStation { get; set; }

    public string ZoneId => ExtractLocationId(ForecastZone);
    
    public string CountId => ExtractLocationId(County);

    public string RadarStationUrl => $"https://radar.weather.gov/ridge/standard/{RadarStation}_loop.gif";

    private static string ExtractLocationId(string url)
    {
        var uri      = new Uri(url);
        var path     = uri.AbsolutePath.TrimEnd('/');
        var segments = path.Split('/');

        return segments[^1];
    }
}
