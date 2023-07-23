using System.Runtime.Serialization;

namespace WeatherGoat.Models;

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
    Error,
}