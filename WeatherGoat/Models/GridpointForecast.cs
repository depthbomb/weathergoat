namespace WeatherGoat.Models;

public record GridpointForecast
{
    [JsonPropertyName("periods")]
    public IEnumerable<GridpointForecastPeriod> Periods { get; set; }
}