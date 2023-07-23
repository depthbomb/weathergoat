using System.Runtime.Serialization;

namespace WeatherGoat.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlertCertainty
{
    [EnumMember(Value = "Observed")]
    Observed,
    [EnumMember(Value = "Likely")]
    Likely,
    [EnumMember(Value = "Possible")]
    Possible,
    [EnumMember(Value = "Unlikely")]
    Unlikely,
    [EnumMember(Value = "Unknown")]
    Unknown,
}