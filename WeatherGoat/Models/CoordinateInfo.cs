namespace WeatherGoat.Models;

[Serializable]
public record CoordinateInfo
{
    public string Latitude      { get; set; }
    public string Longitude     { get; set; }
    public string Location      { get; set; }
    public string ZoneId        { get; set; }
    public string CountyId      { get; set; }
    public string ForecastUrl   { get; set; }
    public string RadarImageUrl { get; set; }
}
