using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

public record Geocode
{
    [JsonPropertyName("SAME")]
    public string[] Same { get; set; }
    
    [JsonPropertyName("UGC")]
    public string[] Ugc { get; set; }
}
