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