namespace WeatherGoat.Models;

public class AlertCollectionJsonLd
{
    [JsonPropertyName("@graph")]
    public IReadOnlyList<Alert> Alerts { get; set; } = new List<Alert>();
    
    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("updated")]
    public DateTime UpdatedAt { get; set; }
}
