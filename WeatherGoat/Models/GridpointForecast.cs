using System.Text.Json.Serialization;

namespace WeatherGoat.Models;

public record GridpointForecast
{
    [JsonPropertyName("periods")]
    public IReadOnlyList<GridpointForecastPeriod> Periods { get; set; }
}
