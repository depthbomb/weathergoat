using System.ComponentModel.DataAnnotations;

namespace WeatherGoat.Data.Entities;

public class SentAlert
{
    public Guid Id { get; set; }
    
    [Required]
    public string AlertId { get; set; }
}
