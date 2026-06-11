namespace AGB.CaptureCore;

/// <summary>
/// Canonical filesystem locations for the helper. Everything lives under
/// <c>%LOCALAPPDATA%\AGBCaptureHelper\</c> (the Windows analogue of the macOS
/// helper's <c>~/Library/Application Support/AGBCaptureHelper/</c>).
///
/// On macOS the helper enforced founder-only POSIX perms (dirs 0700, files
/// 0600, NFR-CALL-SEC-1). The Windows equivalent — restricting the ACL to the
/// current user — is applied via <see cref="FilePermissions"/> at create time.
/// <c>%LOCALAPPDATA%</c> is already per-user and not world-readable by default,
/// so this is defense in depth rather than the only barrier.
/// </summary>
public static class HelperPaths
{
    /// <summary>Overridable root for tests / sandboxing (set before first use).</summary>
    public static string? OverrideRoot { get; set; }

    public static string AppSupportDir()
    {
        if (OverrideRoot is { } root) return root;
        string local = Environment.GetFolderPath(
            Environment.SpecialFolder.LocalApplicationData,
            Environment.SpecialFolderOption.Create);
        if (string.IsNullOrEmpty(local))
        {
            // Fallback mirrors the Swift home-dir fallback.
            local = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "AppData", "Local");
        }
        return Path.Combine(local, "AGBCaptureHelper");
    }

    public static string SpoolDir() => Path.Combine(AppSupportDir(), "spool");

    public static string LogsDir() => Path.Combine(AppSupportDir(), "logs");

    public static string ConfigPath() => Path.Combine(AppSupportDir(), "config.json");

    /// <summary>
    /// Create a directory (and intermediates) and lock it down to the current
    /// user where the platform supports it (Windows ACLs).
    /// </summary>
    public static string EnsureDirectory(string path)
    {
        Directory.CreateDirectory(path);
        FilePermissions.RestrictToCurrentUser(path, isDirectory: true);
        return path;
    }
}
