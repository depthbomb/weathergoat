using System.Diagnostics.CodeAnalysis;

namespace WeatherGoat.Exceptions;

public class CommandArgumentException : CommandException
{
    public CommandArgumentException() { }
    public CommandArgumentException(string? message) : base(message) { }
    public CommandArgumentException(string? message, Exception inner) : base(message, inner) { }

    public static void Assert(bool predicate, string? message)
    {
        if (!predicate)
        {
            Throw(message);
        }
    }

    [DoesNotReturn]
    private static void Throw(string? message) => throw new CommandArgumentException(message);
}
