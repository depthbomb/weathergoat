using System.Text;

namespace WeatherGoat.Shared;

public static class StringExtensions
{
    public static string ToCodeBlock(this string content, string language = "md")
    {
        return new StringBuilder()
            .Append("```")
            .Append(language)
            .AppendLine(content)
            .Append("```")
            .ToString();
    }
    
    public static string ToScreamingSnakeCase(this string input)
    {
        if (string.IsNullOrEmpty(input))
        {
            return string.Empty;
        }

        var result = new StringBuilder();
        foreach (var c in input.Where(char.IsLetterOrDigit))
        {
            if (char.IsUpper(c) && result.Length > 0)
            {
                result.Append('_');
            }
            result.Append(char.ToUpper(c));
        }

        return result.ToString();
    }
}
