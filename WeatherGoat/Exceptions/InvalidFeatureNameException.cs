using System.Text.RegularExpressions;
using System.Diagnostics.CodeAnalysis;

namespace WeatherGoat.Exceptions;

public class InvalidFeatureNameException : Exception
{
    private static readonly Regex FeatureNamePattern = new("^[A-Z0-9](?:[A-Z0-9_]*[A-Z0-9])?$", RegexOptions.Compiled);
    
    public InvalidFeatureNameException() { }
    public InvalidFeatureNameException(string message) : base(message) { }
    public InvalidFeatureNameException(string message, Exception inner) : base(message, inner) { }
    
    public static void ThrowIfInvalid(string value)
    {
        if (!FeatureNamePattern.IsMatch(value))
        {
            Throw();
        }
    }

    [DoesNotReturn]
    internal static void Throw() => throw new InvalidFeatureNameException();
}
