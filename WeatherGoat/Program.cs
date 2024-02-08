using Microsoft.Extensions.Hosting;

namespace WeatherGoat;

internal static class Program
{
    private static async Task Main(string[] args)
    {
        Directory.SetCurrentDirectory(AppDomain.CurrentDomain.BaseDirectory);

        if (!File.Exists(Constants.ConfigFilePath))
        {
            Console.WriteLine("Missing config file at expected path {0}", Constants.ConfigFilePath);
            Environment.Exit(1);
        }
        
        try
        {
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
        foreach (var dir in new[] { Constants.LogsDirectory, Constants.DatabaseDirectory })
        {
            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
        }
    }
}
