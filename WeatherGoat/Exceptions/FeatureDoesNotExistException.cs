using WeatherGoat.Data.Entities;
using System.Diagnostics.CodeAnalysis;

namespace WeatherGoat.Exceptions;

public class FeatureDoesNotExistException : Exception
{
    public FeatureDoesNotExistException() { }
    public FeatureDoesNotExistException(string? message) : base(message) { }
    public FeatureDoesNotExistException(string? message, Exception inner) : base(message, inner) { }
    
    public static void ThrowIfNull([NotNullIfNotNull(nameof(value))] Feature? value)
    {
        if (value is null)
        {
            Throw();
        }
    }

    [DoesNotReturn]
    internal static void Throw() => throw new FeatureDoesNotExistException();
}
