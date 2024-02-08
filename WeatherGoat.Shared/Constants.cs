using System.Runtime.InteropServices;

namespace WeatherGoat.Shared;

public static class Constants
{
    public const ulong CreatorId = 133325534548590594;
    
    public static readonly DateTime StartDate = DateTime.Now;

    public static readonly bool IsLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);

    #region Strings
    public static readonly string AlertWebhookName = "WeatherGoat#Alerts";
    public static readonly string BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    public static readonly string BotUserAgent     = $"WeatherGoat (github.com/depthbomb/WeatherGoatNext)";
    #endregion

    #region Filesystem
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
    #endregion
}
