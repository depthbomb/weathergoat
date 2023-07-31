namespace WeatherGoat.Common;

public static class UsStates
{
    private static readonly IReadOnlyDictionary<string, string> States = new Dictionary<string, string>
    {
        { "AL", "Alabama" },
        { "AK", "Alaska" },
        { "AZ", "Arizona" },
        { "AR", "Arkansas" },
        { "CA", "California" },
        { "CO", "Colorado" },
        { "CT", "Connecticut" },
        { "DE", "Delaware" },
        { "FL", "Florida" },
        { "GA", "Georgia" },
        { "HI", "Hawaii" },
        { "ID", "Idaho" },
        { "IL", "Illinois" },
        { "IN", "Indiana" },
        { "IA", "Iowa" },
        { "KS", "Kansas" },
        { "KY", "Kentucky" },
        { "LA", "Louisiana" },
        { "ME", "Maine" },
        { "MD", "Maryland" },
        { "MA", "Massachusetts" },
        { "MI", "Michigan" },
        { "MN", "Minnesota" },
        { "MS", "Mississippi" },
        { "MO", "Missouri" },
        { "MT", "Montana" },
        { "NE", "Nebraska" },
        { "NV", "Nevada" },
        { "NH", "New Hampshire" },
        { "NJ", "New Jersey" },
        { "NM", "New Mexico" },
        { "NY", "New York" },
        { "NC", "North Carolina" },
        { "ND", "North Dakota" },
        { "OH", "Ohio" },
        { "OK", "Oklahoma" },
        { "OR", "Oregon" },
        { "PA", "Pennsylvania" },
        { "RI", "Rhode Island" },
        { "SC", "South Carolina" },
        { "SD", "South Dakota" },
        { "TN", "Tennessee" },
        { "TX", "Texas" },
        { "UT", "Utah" },
        { "VT", "Vermont" },
        { "VA", "Virginia" },
        { "WA", "Washington" },
        { "WV", "West Virginia" },
        { "WI", "Wisconsin" },
        { "WY", "Wyoming" }
    }.AsReadOnly();

    public static readonly IReadOnlyList<string> Abbreviations = States.Keys.ToList().AsReadOnly();
    public static readonly IReadOnlyList<string> Names         = States.Values.ToList().AsReadOnly();

    public static string GetNameByAbbreviation(string abbreviation) =>
        States.FirstOrDefault(
            x => string.Equals(x.Key, abbreviation, StringComparison.CurrentCultureIgnoreCase)
        ).Value;
    
    public static string GetAbbreviationByName(string name) =>
        States.FirstOrDefault(
            x => string.Equals(x.Value, name, StringComparison.CurrentCultureIgnoreCase)
        ).Key;
}
