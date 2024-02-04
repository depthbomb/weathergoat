using System.Text;

namespace WeatherGoat.Extensions;

public static class StringExtensions
{
    public static string ToCodeBlock(this string content, string language = "md")
    {
        var sb = new StringBuilder();
        sb.Append("```");
        sb.Append(language);
        sb.AppendLine(content);
        sb.Append("```");

        return sb.ToString();
    }
}
