using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

public record RelativeLocation
{
    [JsonPropertyName("city")]
    public string City { get; set; }
    
    [JsonPropertyName("state")]
    public string State { get; set; }
    
    [JsonPropertyName("geometry")]
    public string Geometry { get; set; }

    public string CityState => $"{City}, {State}";
}
