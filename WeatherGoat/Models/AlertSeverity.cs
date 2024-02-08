using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

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