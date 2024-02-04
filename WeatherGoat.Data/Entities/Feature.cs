using System.Text;

namespace WeatherGoat.Data.Entities;

public class Feature
{
    public Guid   Id          { get; set; }
    public string Name        { get; set; }
    public string Description { get; set; }
    public bool   Enabled     { get; set; }

    #region Overrides of Object
    public override string ToString()
    {
        var sb = new StringBuilder()
            .Append(Name)
            .Append(": ")
            .Append(Description)
            .Append(" - ")
            .Append(Enabled);

        return sb.ToString();
    }
    #endregion
}
