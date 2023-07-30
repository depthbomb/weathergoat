namespace WeatherGoat.Shared;

public static class Paths
{
    private static readonly string Root = Path.GetFullPath(".");
    public static readonly  string Logs = Path.Combine(Root, "Logs");
    public static readonly  string Data = Path.Combine(Root, "Data");
}
