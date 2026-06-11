using System.Drawing;
using System.Windows.Forms;

namespace AGB.CaptureHelper.UI;

/// <summary>
/// The small, topmost, non-activating "Call detected — record?" window pinned to
/// the bottom-right of the working area. Windows analogue of the macOS
/// floating <c>NSPanel</c> in <c>PromptController.swift</c>. It never steals
/// focus from the call (WS_EX_NOACTIVATE) and times out to "not recording".
/// </summary>
public sealed class RecordPromptForm : Form
{
    public event Action? RecordClicked;
    /// <summary><c>timedOut</c> distinguishes an explicit Dismiss from the timeout.</summary>
    public event Action<bool>? Dismissed;

    private readonly System.Windows.Forms.Timer _timeout = new();

    public RecordPromptForm(string? sourceApp, int timeoutSeconds = 60)
    {
        string title = sourceApp is null ? "Call detected." : $"Call detected ({sourceApp}).";

        FormBorderStyle = FormBorderStyle.FixedToolWindow;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        ControlBox = false;
        Text = "AGB Capture Helper";
        ClientSize = new Size(300, 96);
        BackColor = Color.FromArgb(32, 32, 36);
        ForeColor = Color.White;

        var label = new Label
        {
            Text = $"{title}\nRecord this call?",
            AutoSize = false,
            Location = new Point(16, 12),
            Size = new Size(268, 36),
            Font = new Font(Font.FontFamily, 9.5f, FontStyle.Regular),
            ForeColor = Color.White,
        };

        var recordButton = new Button
        {
            Text = "Record",
            Location = new Point(150, 56),
            Size = new Size(64, 28),
            BackColor = Color.FromArgb(196, 48, 48),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
        };
        recordButton.Click += (_, _) => Finish(record: true);

        var dismissButton = new Button
        {
            Text = "Dismiss",
            Location = new Point(220, 56),
            Size = new Size(68, 28),
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
        };
        dismissButton.Click += (_, _) => Finish(record: false, timedOut: false);

        Controls.Add(label);
        Controls.Add(recordButton);
        Controls.Add(dismissButton);
        AcceptButton = recordButton; // Enter = Record
        CancelButton = dismissButton; // Esc = Dismiss

        _timeout.Interval = timeoutSeconds * 1000;
        _timeout.Tick += (_, _) => Finish(record: false, timedOut: true);
    }

    /// <summary>Do not steal focus when shown — the call app keeps the keyboard.</summary>
    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            const int WS_EX_NOACTIVATE = 0x08000000;
            const int WS_EX_TOOLWINDOW = 0x00000080;
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW;
            return cp;
        }
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        PositionBottomRight();
        _timeout.Start();
    }

    private void PositionBottomRight()
    {
        Rectangle wa = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Location = new Point(wa.Right - Width - 16, wa.Bottom - Height - 16);
    }

    private bool _finished;

    private void Finish(bool record, bool timedOut = false)
    {
        if (_finished) return;
        _finished = true;
        _timeout.Stop();
        if (record) RecordClicked?.Invoke();
        else Dismissed?.Invoke(timedOut);
        Close();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _timeout.Dispose();
        base.Dispose(disposing);
    }
}
