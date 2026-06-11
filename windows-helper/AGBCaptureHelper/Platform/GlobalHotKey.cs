using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows.Forms;
using AGB.CaptureCore;

namespace AGB.CaptureHelper.Platform;

/// <summary>
/// Global hotkey (default Ctrl+Shift+R) for manual start/stop (FR-CALL-TRG-4),
/// the Windows analogue of the macOS Carbon <c>RegisterEventHotKey</c> helper.
///
/// Uses the Win32 <c>RegisterHotKey</c> API against a hidden message-only window
/// (this <see cref="NativeWindow"/>). Works without any special permission. If
/// the chord is already taken by another app, <see cref="Register"/> returns
/// false and the helper simply runs without a hotkey (the tray menu still works).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class GlobalHotKey : NativeWindow, IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const int HotKeyId = 0xA9B; // arbitrary, unique within this process

    // Modifier flags for RegisterHotKey.
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint MOD_NOREPEAT = 0x4000;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public Action? OnPressed { get; set; }

    private bool _registered;

    public GlobalHotKey()
    {
        // Create a message-only window to receive WM_HOTKEY.
        CreateHandle(new CreateParams());
    }

    /// <summary>Register the chord. Returns false if it could not be registered (e.g. taken).</summary>
    public bool Register(uint virtualKey = 0x52 /* 'R' */, uint modifiers = MOD_CONTROL | MOD_SHIFT)
    {
        if (_registered) return true;
        _registered = RegisterHotKey(Handle, HotKeyId, modifiers | MOD_NOREPEAT, virtualKey);
        if (_registered)
            HelperLog.Shared.Info("global hotkey registered (Ctrl+Shift+R)", category: "hotkey");
        else
            HelperLog.Shared.Warn("global hotkey Ctrl+Shift+R already in use — skipping", category: "hotkey");
        return _registered;
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HotKeyId)
        {
            OnPressed?.Invoke();
        }
        base.WndProc(ref m);
    }

    public void Dispose()
    {
        if (_registered)
        {
            UnregisterHotKey(Handle, HotKeyId);
            _registered = false;
        }
        if (Handle != IntPtr.Zero) DestroyHandle();
    }
}
