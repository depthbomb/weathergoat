namespace WeatherGoat.Models;

public record RelativeLocationGeoJson
{
    [JsonPropertyName("properties")]
    public RelativeLocation Properties { get; set; }
}