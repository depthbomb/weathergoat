namespace WeatherGoat.Shared;

public static class Paths
{
    private static readonly string StoreRoot = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
    public static readonly  string Store     = Path.Combine(StoreRoot, ".weathergoat");
    public static readonly  string Logs      = Path.Combine(Store, "Logs");
    public static readonly  string Data      = Path.Combine(Store, "Data");
}
