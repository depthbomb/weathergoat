namespace WeatherGoat.Models;

public record PointJsonLd
{
    [JsonPropertyName("geometry")]
    public string Geometry { get; set; }
    
    [JsonPropertyName("gridId")]
    public string GridId { get; set; }
    
    [JsonPropertyName("gridX")]
    public int GridX { get; set; }
    
    [JsonPropertyName("gridY")]
    public int GridY { get; set; }
    
    [JsonPropertyName("forecast")]
    public string ForecastUrl { get; set; }
    
    [JsonPropertyName("forecastHourly")]
    public string HourlyForecastUrl { get; set; }
    
    [JsonPropertyName("forecastGridData")]
    public string GridDataForecastUrl { get; set; }
    
    [JsonPropertyName("observationStations")]
    public string ObservationStationsUrl { get; set; }
    
    [JsonPropertyName("relativeLocation")]
    public RelativeLocationJsonLd RelativeLocation { get; set; }
    
    [JsonPropertyName("forecastZone")]
    public string ZoneForecastUrl { get; set; }
    
    public string CountyId => ExtractLocationId(CountyUrl);
    
    [JsonPropertyName("county")]
    public string CountyUrl { get; set; }
    
    [JsonPropertyName("fireWeatherZone")]
    public string FireWeatherZoneUrl { get; set; }
    
    [JsonPropertyName("timeZone")]
    public string Timezone { get; set; }
    
    public string RadarImageLoopUrl => $"https://radar.weather.gov/ridge/standard/{RadarStation}_loop.gif";
    
    [JsonPropertyName("radarStation")]
    public string RadarStation { get; set; }

    public string ZoneId => ExtractLocationId(ZoneForecastUrl);

    private static string ExtractLocationId(string url)
    {
        var uri      = new Uri(url);
        var path     = uri.AbsolutePath.TrimEnd('/');
        var segments = path.Split('/');

        return segments[^1];
    }
}
