using System.Drawing;
using System.Windows.Forms;
using AGB.CaptureCore;

namespace AGB.CaptureHelper.UI;

/// <summary>
/// Modal dialog with the fields the helper needs: CRM base URL, the
/// <c>agbcap_…</c> capture token (masked), and the comma-separated never-prompt
/// app list. Windows analogue of <c>ConfigurePanel.swift</c>. Returns the
/// updated config via <see cref="Result"/> when the user clicks Save; the caller
/// persists it (config.json, current-user ACL).
/// </summary>
public sealed class ConfigureForm : Form
{
    private readonly TextBox _urlField;
    private readonly TextBox _tokenField;
    private readonly TextBox _neverPromptField;
    private readonly HelperConfig _original;

    /// <summary>The updated config when the dialog closes with <see cref="DialogResult.OK"/>.</summary>
    public HelperConfig? Result { get; private set; }

    public ConfigureForm(HelperConfig config)
    {
        _original = config;

        Text = "Configure AGB Capture Helper";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(420, 280);

        var urlLabel = new Label { Text = "CRM base URL", Location = new Point(20, 18), AutoSize = true };
        _urlField = new TextBox
        {
            Location = new Point(20, 38),
            Width = 380,
            Text = config.CrmBaseUrl,
            PlaceholderText = "https://x.caneycloud.com",
        };

        var tokenLabel = new Label { Text = "Capture token", Location = new Point(20, 74), AutoSize = true };
        _tokenField = new TextBox
        {
            Location = new Point(20, 94),
            Width = 380,
            Text = config.Token,
            UseSystemPasswordChar = true,
            PlaceholderText = "agbcap_…",
        };

        var npLabel = new Label { Text = "Never-prompt apps (comma-separated)", Location = new Point(20, 130), AutoSize = true };
        _neverPromptField = new TextBox
        {
            Location = new Point(20, 150),
            Width = 380,
            Text = string.Join(", ", config.NeverPromptApps),
            PlaceholderText = "Dictation, SuperWhisper",
        };

        var hint = new Label
        {
            Text = "Mint a capture token in CRM Settings → Call capture (shown once). " +
                   "Stored locally under %LOCALAPPDATA% with a current-user ACL.",
            Location = new Point(20, 186),
            Size = new Size(380, 40),
            ForeColor = SystemColors.GrayText,
        };

        var saveButton = new Button { Text = "Save", Location = new Point(244, 236), Size = new Size(72, 28), DialogResult = DialogResult.OK };
        saveButton.Click += (_, _) => CommitAndClose();
        var cancelButton = new Button { Text = "Cancel", Location = new Point(328, 236), Size = new Size(72, 28), DialogResult = DialogResult.Cancel };

        AcceptButton = saveButton;
        CancelButton = cancelButton;

        Controls.AddRange(new Control[]
        {
            urlLabel, _urlField, tokenLabel, _tokenField,
            npLabel, _neverPromptField, hint, saveButton, cancelButton,
        });
    }

    private void CommitAndClose()
    {
        var updated = new HelperConfig
        {
            CrmBaseUrl = _urlField.Text.Trim(),
            Token = _tokenField.Text.Trim(),
            RetentionNote = _original.RetentionNote,
            NeverPromptApps = _neverPromptField.Text
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList(),
            HelperVersion = AudioConstants.HelperVersion,
        };
        Result = updated;
    }
}
