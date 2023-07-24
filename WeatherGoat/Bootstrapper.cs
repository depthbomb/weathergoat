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

        try
        {
            await new WeatherGoat(args).StartAsync();
        }
        catch (Exception e) when (e is not(TaskCanceledException or HostAbortedException))
        {
            Console.WriteLine(e);
        }
        finally
        {
            await Log.CloseAndFlushAsync();
        }
    }
}
