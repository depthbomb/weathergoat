namespace WeatherGoat.Exceptions;

public class DestinationExistsException : Exception
{
    public DestinationExistsException() { }
    public DestinationExistsException(string? message) : base(message) { }
    public DestinationExistsException(string? message, Exception inner) : base(message, inner) { }
}
