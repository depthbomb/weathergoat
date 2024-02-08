using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

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