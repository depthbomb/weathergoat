using System.ComponentModel.DataAnnotations;

namespace WeatherGoat.Data.Entities;

public class SentAlert
{
    [Key]
    public Guid   Id      { get; set; }
    public string AlertId { get; set; }
}
