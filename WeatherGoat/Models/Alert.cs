namespace WeatherGoat.Models;

public record Alert
{
    [JsonPropertyName("id")]
    public string Id { get; set; }
    
    [JsonPropertyName("title")]
    public string Title { get; set; }
    
    [JsonPropertyName("areaDesc")]
    public string AreaDescription { get; set; }
    
    [JsonPropertyName("sent")]
    public DateTime Sent { get; set; }
    
    [JsonPropertyName("effective")]
    public DateTime Effective { get; set; }
    
    [JsonPropertyName("expires")]
    public DateTime Expires { get; set; }

    [JsonPropertyName("status")]
    public AlertStatus Status { get; set; }
    
    [JsonPropertyName("messageType")]
    public AlertMessageType MessageType { get; set; }
    
    [JsonPropertyName("severity")]
    public AlertSeverity Severity { get; set; }
    
    [JsonPropertyName("certainty")]
    public AlertCertainty Certainty { get; set; }
    
    [JsonPropertyName("urgency")]
    public AlertUrgency Urgency { get; set; }
    
    [JsonPropertyName("event")]
    public string Event { get; set; }
    
    [JsonPropertyName("senderName")]
    public string SenderName { get; set; }
    
    [JsonPropertyName("headline")]
    public string Headline { get; set; }
    
    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("instructions")]
    public string Instructions { get; set; } = null;
    
    [JsonPropertyName("response")]
    public AlertResponse Response { get; set; }
}
