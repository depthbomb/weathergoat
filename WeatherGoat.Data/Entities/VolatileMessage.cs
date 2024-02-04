using System.ComponentModel.DataAnnotations;

namespace WeatherGoat.Data.Entities;

public class VolatileMessage
{
    public Guid Id { get; set; }

    [Required]
    public ulong ChannelId { get; set; }

    [Required]
    public ulong MessageId { get; set; }

    [Required]
    public DateTime ExpiresAt { get; set; }
}
