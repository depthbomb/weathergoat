namespace WeatherGoat.Shared;

public static class Paths
{
    private static readonly string LocalAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    public static readonly  string Store        = Path.Combine(LocalAppData, ".weathergoat");
    public static readonly  string Logs         = Path.Combine(Store, "Logs");
    public static readonly  string Data         = Path.Combine(Store, "Data");
}
