using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

public record AlertCollection
{
    [JsonPropertyName("title")]
    public string Title { get; set; }
    
    [JsonPropertyName("updated")]
    public DateTime UpdatedAt { get; set; }
    
    [JsonPropertyName("@graph")]
    public IReadOnlyList<Alert> Alerts { get; set; }

    public bool HasAlerts => Alerts.Count > 0;
}
