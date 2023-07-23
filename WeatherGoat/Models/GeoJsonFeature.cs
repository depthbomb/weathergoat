namespace WeatherGoat.Models;

public record GeoJsonFeature
{
    [JsonPropertyName("properties")]
    public Alert Properties { get; set; }
}