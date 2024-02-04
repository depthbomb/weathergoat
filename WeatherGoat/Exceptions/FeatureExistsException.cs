namespace WeatherGoat.Exceptions;

public class FeatureExistsException : Exception
{
    public FeatureExistsException() { }
    public FeatureExistsException(string? message) : base(message) { }
    public FeatureExistsException(string? message, Exception inner) : base(message, inner) { }
}
