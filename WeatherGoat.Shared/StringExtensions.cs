using System.Text;

namespace WeatherGoat.Shared;

public static class StringExtensions
{
    public static bool IsNullOrEmpty(this string? input) => string.IsNullOrEmpty(input);

    public static bool IsNullOrWhiteSpace(this string? input) => string.IsNullOrWhiteSpace(input);
    
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
