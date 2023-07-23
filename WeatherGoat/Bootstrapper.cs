using Serilog;
using WeatherGoat.Shared;
using Microsoft.Extensions.Hosting;

namespace WeatherGoat;

public static class Bootstrapper
{
    public static async Task Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        Directory.CreateDirectory(Paths.Data);
        Directory.CreateDirectory(Paths.Logs);

        if (Environment.GetEnvironmentVariable("TOKEN") == null)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("Missing TOKEN environment variable.");

            Environment.Exit(1);
        }

        try
        {
            await new WeatherGoat(args).StartAsync();
        }
        catch (Exception e) when (e is not(TaskCanceledException or HostAbortedException))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine(e);
        }
        catch (Exception e) when (e is TaskCanceledException or HostAbortedException)
        {
            Console.WriteLine("Shutting down");
        }
        finally
        {
            await Log.CloseAndFlushAsync();
        }
    }
}
