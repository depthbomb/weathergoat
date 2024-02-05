using Microsoft.Extensions.Hosting;

namespace WeatherGoat;

internal static class Program
{
    private static async Task Main(string[] args)
    {
        try
        {
            Directory.SetCurrentDirectory(AppDomain.CurrentDomain.BaseDirectory);

            CreateRequiredDirectories();

            await new WeatherGoat(args).StartAsync();
        }
        catch (HostAbortedException)
        {
            Console.WriteLine("Hosted aborted");
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
        }
    }
    
    private static void CreateRequiredDirectories()
    {
        foreach (var dir in new[] { Globals.LogsDirectory, Globals.DatabaseDirectory })
        {
            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
        }
    }
}
