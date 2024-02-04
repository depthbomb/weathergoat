using System.Runtime.InteropServices;

namespace WeatherGoat;

public static class Constants
{
    public static readonly DateTime StartDate = DateTime.Now;
    
    private const          int     VersionMajor    = 1;
    private const          int     VersionMinor    = 2;
    private const          int     VersionPatch    = 0;
    private const          int     VersionRevision = 0;
    public static readonly Version Version         = new(VersionMajor, VersionMinor, VersionPatch, VersionRevision);

    public static readonly string AlertWebhookName = "WeatherGoat#Alerts";
    public static readonly string BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    public static readonly string BotUserAgent     = $"WeatherGoat {Version}";

    public static readonly bool IsLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);

    public static string BotDirectory = Path.GetFullPath(".");
    public static string BotDataDirectory
    {
        get
        {
            var dataRoot = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dataDir  = "weathergoat";
            if (IsLinux)
            {
                dataRoot = BotDirectory;
                dataDir  = "data";
            }

            return Path.Combine(dataRoot, dataDir);
        }
    }

    public static readonly string DatabaseDirectory = Path.Combine(BotDataDirectory, "database");
    public static readonly string LogsDirectory     = Path.Combine(BotDataDirectory, "logs");
    public static readonly string DatabaseFilePath  = Path.Combine(DatabaseDirectory, "weathergoat.db");
    public static readonly string LogFilePath       = Path.Combine(LogsDirectory, "weathergoat-.log");
    public static readonly string ConfigFilePath    = Path.Combine(BotDirectory, "weathergoat.xml");
}
