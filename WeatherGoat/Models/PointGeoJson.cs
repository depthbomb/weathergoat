namespace WeatherGoat.Models;

public record PointGeoJson
{
    [JsonPropertyName("properties")]
    public Point Properties { get; set; }
}