using System.Runtime.Versioning;
using AGB.CaptureCore;
using Microsoft.Win32;

namespace AGB.CaptureHelper.Platform;

/// <summary>
/// Launch-at-login via the per-user Run key
/// (<c>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</c>) — the Windows
/// analogue of the macOS helper's <c>SMAppService</c> login-item registration
/// (FR-CALL-OPS-1). Per-user, no admin rights, removable from Task Manager →
/// Startup.
/// </summary>
[SupportedOSPlatform("windows")]
public static class Autostart
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "AGBCaptureHelper";

    public static bool IsEnabled()
    {
        using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
        return key?.GetValue(ValueName) is not null;
    }

    public static void Enable()
    {
        string exePath = Environment.ProcessPath
            ?? throw new InvalidOperationException("Cannot resolve the helper executable path.");
        using RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
        // Quote the path in case it contains spaces.
        key.SetValue(ValueName, $"\"{exePath}\"");
        HelperLog.Shared.Info("autostart enabled (HKCU Run)", category: "app");
    }

    public static void Disable()
    {
        using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
        if (key?.GetValue(ValueName) is not null)
        {
            key.DeleteValue(ValueName, throwOnMissingValue: false);
            HelperLog.Shared.Info("autostart disabled (HKCU Run)", category: "app");
        }
    }

    public static void Toggle()
    {
        if (IsEnabled()) Disable();
        else Enable();
    }
}
