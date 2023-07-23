using System.ComponentModel.DataAnnotations;

namespace WeatherGoat.Data.Entities;

public class CoordinateInfo
{
    [Key]
    public Guid Id            { get; set; }
    public string Latitude    { get; set; }
    public string Longitude   { get; set; }
    public string Location    { get; set; }
    public string ForecastUrl { get; set; }
}
