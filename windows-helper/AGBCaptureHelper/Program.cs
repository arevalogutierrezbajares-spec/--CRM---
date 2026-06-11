using System.Runtime.Versioning;
using System.Windows.Forms;
using AGB.CaptureCore;
using AGB.CaptureHelper.Platform;

namespace AGB.CaptureHelper;

// AGBCaptureHelper — Windows tray call-capture companion for AGB CRM.
//
// Modes:
//   (no args)                 tray app
//   --simulate <wav> [...]    headless E2E: spool + upload a 16 kHz stereo WAV
//   --install-login           register launch-at-login (HKCU Run)
//   --uninstall-login         unregister launch-at-login
//   --version                 print version
//
// This is the entry-point analogue of the macOS helper's main.swift.
[SupportedOSPlatform("windows")]
internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--version"))
        {
            Console.WriteLine($"AGBCaptureHelper {AudioConstants.HelperVersion} (protocol {AudioConstants.ProtocolVersion})");
            return 0;
        }

        if (args.Contains("--simulate"))
        {
            // Headless: no message loop, no WASAPI, no tray.
            return SimulatedEngine.Run(args);
        }

        if (args.Contains("--install-login") || args.Contains("--uninstall-login"))
        {
            try
            {
                if (args.Contains("--install-login"))
                {
                    Autostart.Enable();
                    Console.WriteLine("Registered AGBCaptureHelper to launch at login (HKCU Run).");
                }
                else
                {
                    Autostart.Disable();
                    Console.WriteLine("Unregistered AGBCaptureHelper launch-at-login.");
                }
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Login item change failed: {ex.Message}");
                return 1;
            }
        }

        // Default: tray app.
        ApplicationConfiguration.Initialize(); // enables visual styles + per-monitor DPI
        AppController? controller = null;
        try
        {
            controller = new AppController();
            Application.ApplicationExit += (_, _) => controller?.ShutDown();
            Application.Run(); // message loop with no main window (tray only)
        }
        finally
        {
            controller?.Dispose();
        }
        return 0;
    }
}
