namespace WeatherGoat.Models;

public record GridpointForecastGeoJson
{
    [JsonPropertyName("properties")]
    public GridpointForecast Properties { get; set; }
}