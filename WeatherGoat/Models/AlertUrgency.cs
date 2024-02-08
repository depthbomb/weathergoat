using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

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