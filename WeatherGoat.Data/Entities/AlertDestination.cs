using System.ComponentModel.DataAnnotations;

namespace WeatherGoat.Data.Entities;

public class AlertDestination
{
    public Guid Id { get; set; }

    [Required]
    public string Latitude { get; set; }

    [Required]
    public string Longitude { get; set; }

    [Required]
    public string ZoneId { get; set; }

    [Required]
    public string CountyId { get; set; }

    [Required]
    public ulong ChannelId { get; set; }

    public bool AutoCleanup { get; set; } = true;

    [Required]
    public string? RadarImageUrl { get; set; }

    public bool PingOnSevereOrExtreme { get; set; } = false;
}
