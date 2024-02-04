using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

public record Point
{
    [JsonPropertyName("gridX")]
    public int GridX { get; set; }

    [JsonPropertyName("gridY")]
    public int GridY { get; set; }
    
    [JsonPropertyName("forecast")]
    public string Forecast { get; set; }
    
    [JsonPropertyName("forecastHourly")]
    public string HourlyForecast { get; set; }
    
    [JsonPropertyName("forecastGridData")]
    public string ForecastGridData { get; set; }
    
    [JsonPropertyName("observationStations")]
    public string ObservationStations { get; set; }
    
    [JsonPropertyName("relativeLocation")]
    public RelativeLocation RelativeLocation { get; set; }
    
    [JsonPropertyName("forecastZone")]
    public string ForecastZone { get; set; }
    
    [JsonPropertyName("county")]
    public string? County { get; set; }
    
    [JsonPropertyName("fireWeatherZone")]
    public string FireWeatherZone { get; set; }
    
    [JsonPropertyName("timeZone")]
    public string Timezone { get; set; }
    
    [JsonPropertyName("radarStation")]
    public string RadarStation { get; set; }

    public string RadarImageUrl => $"https://radar.weather.gov/ridge/standard/{RadarStation}_loop.gif";
    public string CountyId      => County != null ? County.Split('/')[^1] : string.Empty;
    public string ZoneId        => ForecastZone.Split('/')[^1];
}
