namespace WeatherGoat.Extensions;

public static class DateTimeExtensions
{
    public static string ToTimestampTag(this DateTime date, TimestampTagStyles format) 
        => new TimestampTag(date, format).ToString();
}
