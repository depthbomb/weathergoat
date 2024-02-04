namespace WeatherGoat.Shared;

public static class EnumerableExtensions
{
    public static string ToQueryStringArray(this IEnumerable<string> values, string parameterName)
    {
        var queryString = string.Join("&", values.Select(value => $"{parameterName}[]={Uri.EscapeDataString(value)}"));

        return queryString;
    }
}
