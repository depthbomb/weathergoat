using Discord;

namespace WeatherGoat.Models;

public record DispatcherMessagePayload
{
    public string           Text             { get; set; } = null;
    public bool             IsTTS            { get; set; } = false;
    public Embed            Embed            { get; set; } = null;
    public RequestOptions   Options          { get; set; } = null;
    public AllowedMentions  AllowedMentions  { get; set; } = null;
    public MessageReference MessageReference { get; set; } = null;
    public MessageComponent Components       { get; set; } = null;
    public ISticker[]       Stickers         { get; set; } = null;
    public Embed[]          Embeds           { get; set; } = null;
    public MessageFlags     Flags            { get; set; } = MessageFlags.None;

    #region Overrides of Object
    public override string ToString()
    {
        return JsonSerializer.Serialize(this);
    }
    #endregion
}
