namespace WeatherGoat.Models;

public record ForecastReport
{
    public string Location         { get; set; }
    public string Time             { get; set; }
    public string Icon             { get; set; }
    public string ShortForecast    { get; set; }
    public string DetailedForecast { get; set; }
    public string RadarImageUrl    { get; set; }
}
