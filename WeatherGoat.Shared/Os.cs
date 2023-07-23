using System.Runtime.InteropServices;

namespace WeatherGoat.Shared;

public static class Os
{
    /// <summary>
    /// Whether or not the assembly is running on Windows.
    /// </summary>
    public static readonly bool IsWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
    /// <summary>
    /// Whether or not the assembly is running on Linux.
    /// </summary>
    public static readonly bool IsLinux   = RuntimeInformation.IsOSPlatform(OSPlatform.Linux) || RuntimeInformation.IsOSPlatform(OSPlatform.FreeBSD);
    /// <summary>
    /// Whether or not the assembly is running on Mac OSX.
    /// </summary>
    public static readonly bool IsOsx     = RuntimeInformation.IsOSPlatform(OSPlatform.OSX);
}
