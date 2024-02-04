namespace WeatherGoat.Exceptions;

public class DestinationDoesNotExistException : Exception
{
    public DestinationDoesNotExistException() { }
    public DestinationDoesNotExistException(string? message) : base(message) { }
    public DestinationDoesNotExistException(string? message, Exception inner) : base(message, inner) { }
}
