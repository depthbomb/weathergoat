using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

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