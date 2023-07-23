using System.Runtime.Serialization;

namespace WeatherGoat.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertUrgency
{
    [EnumMember(Value = "Immediate")]
    Immediate,
    [EnumMember(Value = "Expected")]
    Expected,
    [EnumMember(Value = "Future")]
    Future,
    [EnumMember(Value = "Past")]
    Past,
    [EnumMember(Value = "Unknown")]
    Unknown
}