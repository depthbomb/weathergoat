using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertStatus
{
    [EnumMember(Value = "Actual")]
    Actual,
    [EnumMember(Value = "Exercise")]
    Exercise,
    [EnumMember(Value = "System")]
    System,
    [EnumMember(Value = "Test")]
    Test,
    [EnumMember(Value = "Draft")]
    Draft
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertMessageType
{
    [EnumMember(Value = "Alert")]
    Alert,
    [EnumMember(Value = "Update")]
    Update,
    [EnumMember(Value = "Cancel")]
    Cancel,
    [EnumMember(Value = "Ack")]
    Ack,
    [EnumMember(Value = "Error")]
    Error
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertSeverity
{
    [EnumMember(Value = "Extreme")]
    Extreme,
    [EnumMember(Value = "Severe")]
    Severe,
    [EnumMember(Value = "Moderate")]
    Moderate,
    [EnumMember(Value = "Minor")]
    Minor,
    [EnumMember(Value = "Unknown")]
    Unknown
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertCertainty
{
    [EnumMember(Value = "Unknown")]
    Unknown,
    [EnumMember(Value = "Observed")]
    Observed,
    [EnumMember(Value = "Likely")]
    Likely,
    [EnumMember(Value = "Possible")]
    Possible,
    [EnumMember(Value = "Unlikely")]
    Unlikely
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertUrgency
{
    [EnumMember(Value = "Unknown")]
    Unknown,
    [EnumMember(Value = "Immediate")]
    Immediate,
    [EnumMember(Value = "Expected")]
    Expected,
    [EnumMember(Value = "Future")]
    Future,
    [EnumMember(Value = "Past")]
    Past
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertResponse
{
    [EnumMember(Value = "Shelter")]
    Shelter,
    [EnumMember(Value = "Evacuate")]
    Evacuate,
    [EnumMember(Value = "Prepare")]
    Prepare,
    [EnumMember(Value = "Execute")]
    Execute,
    [EnumMember(Value = "Avoid")]
    Avoid,
    [EnumMember(Value = "Monitor")]
    Monitor,
    [EnumMember(Value = "Assess")]
    Assess,
    [EnumMember(Value = "AllClear")]
    AllClear,
    [EnumMember(Value = "None")]
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
    public DateTime? EndsAt { get; set; }

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
