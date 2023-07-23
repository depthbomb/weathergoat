namespace WeatherGoat.Models;

public record Point
{
    [JsonPropertyName("forecast")]
    public string Forecast { get; set; }
	
    [JsonPropertyName("relativeLocation")]
    public RelativeLocationGeoJson RelativeLocation { get; set; }
}