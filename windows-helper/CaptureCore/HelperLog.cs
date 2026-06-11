using System.Globalization;
using System.Text;

namespace AGB.CaptureCore;

/// <summary>
/// Rotating plain-text logger under <c>%LOCALAPPDATA%\AGBCaptureHelper\logs\</c>
/// so the diagnostics bundle (FR-CALL-OPS-6) can include a log tail.
///
/// Port of <c>HelperLog.swift</c>. The Swift version also wrote to the unified
/// <c>os.Logger</c>; here we additionally mirror to <see cref="System.Diagnostics.Trace"/>
/// (visible in DebugView / the VS output window) and stderr. Logging is
/// best-effort and must never throw or crash the helper.
/// </summary>
public sealed class HelperLog
{
    public const string Subsystem = "com.agb.capture-helper";
    public static readonly HelperLog Shared = new();

    private readonly object _lock = new();
    private const long MaxFileBytes = 1_000_000;
    private const int Rotations = 3;

    private string LogFilePath => Path.Combine(HelperPaths.LogsDir(), "helper.log");

    public void Info(string message, string category = "helper") =>
        Write("INFO", category, message);

    public void Warn(string message, string category = "helper") =>
        Write("WARN", category, message);

    public void Error(string message, string category = "helper") =>
        Write("ERROR", category, message);

    /// <summary>Last <paramref name="lines"/> lines of the plain-text log (diagnostics bundle).</summary>
    public string Tail(int lines = 200)
    {
        lock (_lock)
        {
            try
            {
                if (!File.Exists(LogFilePath)) return "(no log file)";
                string[] all = File.ReadAllLines(LogFilePath);
                int take = Math.Min(lines, all.Length);
                return string.Join("\n", all.Skip(all.Length - take));
            }
            catch
            {
                return "(log unreadable)";
            }
        }
    }

    // -------------------------------------------------- File writing + rotation

    private void Write(string level, string category, string message)
    {
        string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture);
        string line = $"{timestamp} [{level}] [{category}] {message}";

        System.Diagnostics.Trace.WriteLine(line);
        Console.Error.WriteLine(line);

        lock (_lock)
        {
            try
            {
                HelperPaths.EnsureDirectory(HelperPaths.LogsDir());
                string path = LogFilePath;
                bool existed = File.Exists(path);
                File.AppendAllText(path, line + "\n", Encoding.UTF8);
                if (!existed)
                    FilePermissions.RestrictToCurrentUser(path, isDirectory: false);

                var info = new FileInfo(path);
                if (info.Exists && info.Length > MaxFileBytes)
                    Rotate();
            }
            catch
            {
                // Logging must never crash the helper.
            }
        }
    }

    private void Rotate()
    {
        try
        {
            string dir = HelperPaths.LogsDir();
            string oldest = Path.Combine(dir, $"helper.log.{Rotations}");
            if (File.Exists(oldest)) File.Delete(oldest);

            for (int i = Rotations - 1; i >= 1; i--)
            {
                string src = Path.Combine(dir, $"helper.log.{i}");
                string dst = Path.Combine(dir, $"helper.log.{i + 1}");
                if (File.Exists(src)) File.Move(src, dst, overwrite: true);
            }

            string first = Path.Combine(dir, "helper.log.1");
            File.Move(LogFilePath, first, overwrite: true);
        }
        catch
        {
            // best-effort
        }
    }
}
