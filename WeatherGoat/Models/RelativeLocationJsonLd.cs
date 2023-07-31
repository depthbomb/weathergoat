namespace WeatherGoat.Models;

public record RelativeLocationJsonLd
{
    [JsonPropertyName("city")]
    public string City { get; set; }
    
    [JsonPropertyName("state")]
    public string State { get; set; }
    
    [JsonPropertyName("geometry")]
    public string Geometry { get; set; }
    
    public string CityAndState => $"{City}, {State}";
}
