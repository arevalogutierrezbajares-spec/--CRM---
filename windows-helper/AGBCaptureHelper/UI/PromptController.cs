using System.Windows.Forms;
using AGB.CaptureCore;

namespace AGB.CaptureHelper.UI;

/// <summary>
/// Owns the lifecycle of the record prompt window, mirroring the macOS
/// <c>PromptController.swift</c>. All access is on the UI thread (the caller
/// invokes from the AppController which already runs on the WinForms message
/// loop). At most one prompt is visible at a time.
/// </summary>
public sealed class PromptController
{
    public Action? OnRecord { get; set; }
    /// <summary><c>timedOut</c> distinguishes an explicit Dismiss from the 60 s timeout.</summary>
    public Action<bool>? OnDismiss { get; set; }

    private RecordPromptForm? _form;

    public bool IsShowing => _form is not null;

    public void Show(string? sourceApp)
    {
        DismissPanel();

        var form = new RecordPromptForm(sourceApp);
        form.RecordClicked += () =>
        {
            _form = null;
            OnRecord?.Invoke();
        };
        form.Dismissed += timedOut =>
        {
            _form = null;
            HelperLog.Shared.Info(
                timedOut ? "prompt timed out (60s) — not recording" : "prompt dismissed — not recording",
                category: "prompt");
            OnDismiss?.Invoke(timedOut);
        };
        _form = form;
        form.Show();
        HelperLog.Shared.Info($"record prompt shown (source: {sourceApp ?? "unknown"})", category: "prompt");
    }

    public void DismissPanel()
    {
        if (_form is { } form)
        {
            _form = null;
            if (!form.IsDisposed) form.Close();
        }
    }
}
