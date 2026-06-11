using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;

namespace AGB.CaptureCore;

/// <summary>
/// Best-effort Windows ACL hardening, the equivalent of the macOS helper's
/// 0700/0600 POSIX modes (NFR-CALL-SEC-1): restrict a file or directory to the
/// current user only. No-op on non-Windows platforms (so CaptureCore still
/// builds and tests on macOS/Linux), and never throws — security hardening must
/// never crash the capture path. Spool/config already live under the per-user
/// <c>%LOCALAPPDATA%</c>; this tightens it further by removing inherited ACEs.
/// </summary>
public static class FilePermissions
{
    public static void RestrictToCurrentUser(string path, bool isDirectory)
    {
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            ApplyWindows(path, isDirectory);
        }
        catch
        {
            // Hardening is defense-in-depth; the per-user LOCALAPPDATA root
            // already excludes other standard users. Swallow on failure.
        }
    }

    [SupportedOSPlatform("windows")]
    private static void ApplyWindows(string path, bool isDirectory)
    {
        var currentUser = WindowsIdentity.GetCurrent().User;
        if (currentUser is null) return;

        if (isDirectory)
        {
            var info = new DirectoryInfo(path);
            var security = new DirectorySecurity();
            // Drop inheritance and grant only the current user full control.
            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
            security.AddAccessRule(new FileSystemAccessRule(
                currentUser,
                FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow));
            info.SetAccessControl(security);
        }
        else
        {
            var info = new FileInfo(path);
            var security = new FileSecurity();
            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
            security.AddAccessRule(new FileSystemAccessRule(
                currentUser,
                FileSystemRights.FullControl,
                AccessControlType.Allow));
            info.SetAccessControl(security);
        }
    }
}
