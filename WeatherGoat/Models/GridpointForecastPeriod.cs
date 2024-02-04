using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

public record GridpointForecastPeriod
{
    [JsonPropertyName("number")]
    public int Number { get; set; }
    
    [JsonPropertyName("name")]
    public string Name { get; set; }
    
    [JsonPropertyName("startTime")]
    public DateTime StartTime        { get; set; }
    
    [JsonPropertyName("endTime")]
    public DateTime EndTime { get; set; }
    
    [JsonPropertyName("isDayTime")]
    public bool IsDayTime { get; set; }
    
    [JsonPropertyName("icon")]
    public string Icon { get; set; }
    
    [JsonPropertyName("shortForecast")]
    public string ShortForecast { get; set; }
    
    [JsonPropertyName("detailedForecast")]
    public string DetailedForecast { get; set; }
}
