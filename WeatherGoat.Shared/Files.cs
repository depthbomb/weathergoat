namespace WeatherGoat.Shared;

public static class Files
{
    public static readonly string Log      = Path.Combine(Paths.Logs, "weathergoat-.log");
    public static readonly string Database = Path.Combine(Paths.Data, "weathergoat.db");
}
