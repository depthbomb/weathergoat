using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

public enum AlertStatus
{
    Actual,
    Exercise,
    System,
    Test,
    Draft
}

public enum AlertMessageType
{
    Alert,
    Update,
    Cancel,
    Ack,
    Error
}

public enum AlertSeverity
{
    Extreme,
    Severe,
    Moderate,
    Minor,
    Unknown
}

public enum AlertCertainty
{
    Unknown,
    Observed,
    Likely,
    Possible,
    Unlikely
}

public enum AlertUrgency
{
    Unknown,
    Immediate,
    Expected,
    Future,
    Past
}

public enum AlertResponse
{
    Shelter,
    Evacuate,
    Prepare,
    Execute,
    Avoid,
    Monitor,
    Assess,
    AllClear,
    None
}

public record Alert
{
    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("areaDesc")]
    public string AreaDescription { get; set; }

    [JsonPropertyName("affectedZones")]
    public string[] AffectedZones { get; set; }

    [JsonPropertyName("geocode")]
    public Geocode Geocode { get; set; }

    [JsonPropertyName("sent")]
    public DateTime SentAt { get; set; }

    [JsonPropertyName("effective")]
    public DateTime EffectiveAt { get; set; }

    [JsonPropertyName("expires")]
    public DateTime ExpiresAt { get; set; }

    [JsonPropertyName("ends")]
    public DateTime EndsAt { get; set; }

    [JsonPropertyName("status")]
    public AlertStatus Status { get; set; }

    [JsonPropertyName("messageType")]
    public AlertMessageType Type { get; set; }

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
    public string? Instructions { get; set; }

    [JsonPropertyName("response")]
    public AlertResponse Response { get; set; }

    public bool IsNotTest => Status is not(AlertStatus.Test or AlertStatus.Exercise or AlertStatus.Draft);

    public Color SeverityColor => Severity switch
    {
        AlertSeverity.Extreme  => new Color(0x7f1d1d),
        AlertSeverity.Severe   => new Color(0xdc2626),
        AlertSeverity.Moderate => new Color(0xf97316),
        AlertSeverity.Minor    => new Color(0xfbbf24),
        AlertSeverity.Unknown  => new Color(0x9ca3af),
        _                      => new Color(0x9ca3af)
    };
}
