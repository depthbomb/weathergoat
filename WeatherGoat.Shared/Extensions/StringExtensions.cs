using System.Text;

namespace WeatherGoat.Shared.Extensions;

public static class StringExtensions
{
    private static readonly char[] InvalidPathCharacters     = Path.GetInvalidPathChars();
    private static readonly char[] InvalidFileNameCharacters = Path.GetInvalidFileNameChars();
    
    public static string Repeat(this string str, int count)
        => new StringBuilder(str.Length * count)
           .Insert(0, str, count)
           .ToString();
    
    public static bool IsNullOrEmpty(this string str)
        => string.IsNullOrEmpty(str);

    public static bool IsNumber(this string str)
        => int.TryParse(str, out int _);
    
    public static string Reverse(this string str)
    {
        char[] chars = str.ToCharArray();
        Array.Reverse(chars);
        return new string(chars);
    }
    
    public static bool IsValidFileName(this string str)
        => !str.IsNullOrEmpty() && str.IndexOfAny(InvalidFileNameCharacters) == -1;

    public static bool IsValidPathName(this string str)
        => !str.IsNullOrEmpty() && str.IndexOfAny(InvalidPathCharacters) == -1;
}
