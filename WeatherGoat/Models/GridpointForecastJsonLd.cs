namespace WeatherGoat.Models;

public record GridpointForecastJsonLd
{
    public IReadOnlyList<GridpointForecastPeriod> Periods { get; set; } = new List<GridpointForecastPeriod>();
}
