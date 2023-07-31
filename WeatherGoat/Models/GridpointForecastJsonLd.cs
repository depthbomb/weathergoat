namespace WeatherGoat.Models;

public record GridpointForecastJsonLd
{
    [JsonPropertyName("periods")]
    public IReadOnlyList<GridpointForecastPeriod> Periods { get; set; } = new List<GridpointForecastPeriod>();
}
