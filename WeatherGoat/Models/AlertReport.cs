namespace WeatherGoat.Models;

public record AlertReport
{
    public string         Id              { get; set; }
    public bool           IsUpdate        { get; set; }
    public AlertStatus    Status          { get; set; }
    public string         Event           { get; set; }
    public string         AreaDescription { get; set; }
    public DateTime       Expires         { get; set; }
    public AlertSeverity  Severity        { get; set; }
    public AlertCertainty Certainty       { get; set; }
    public string         Headline        { get; set; }
    public string         Description     { get; set; }
    public string         Instructions    { get; set; }
    public string         RadarImageUrl   { get; set; }
}
