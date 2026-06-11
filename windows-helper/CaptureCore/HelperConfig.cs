using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AGB.CaptureCore;

/// <summary>
/// Helper configuration, persisted as JSON at
/// <c>%LOCALAPPDATA%\AGBCaptureHelper\config.json</c> (current-user ACL).
///
/// The token is the revocable, founder-scoped <c>agbcap_…</c> credential minted
/// in CRM Settings (server stores only its SHA-256 — NFR-CALL-SEC-2). Env vars
/// <c>AGB_CRM_URL</c> / <c>AGB_CRM_TOKEN</c> override the file (used by simulate
/// mode and CI).
///
/// 1:1 port of <c>Config.swift</c>. Missing/extra JSON keys are tolerated on load.
/// </summary>
public sealed class HelperConfig
{
    [JsonPropertyName("crmBaseUrl")]
    public string CrmBaseUrl { get; set; } = string.Empty;

    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;

    /// <summary>Default consent posture note (FR-CALL-RET-5), e.g. "participant informed verbally".</summary>
    [JsonPropertyName("retentionNote")]
    public string? RetentionNote { get; set; }

    /// <summary>Apps that never trigger the record prompt (FR-CALL-TRG-6).</summary>
    [JsonPropertyName("neverPromptApps")]
    public List<string> NeverPromptApps { get; set; } = new();

    [JsonPropertyName("helperVersion")]
    public string HelperVersion { get; set; } = AudioConstants.HelperVersion;

    [JsonIgnore]
    public bool IsComplete =>
        !string.IsNullOrEmpty(Token)
        && !string.IsNullOrEmpty(CrmBaseUrl)
        && Uri.TryCreate(CrmBaseUrl, UriKind.Absolute, out _);

    // ------------------------------------------------------------ Load / save

    public static HelperConfig? Load(string? path = null)
    {
        path ??= HelperPaths.ConfigPath();
        try
        {
            if (!File.Exists(path)) return null;
            byte[] bytes = File.ReadAllBytes(path);
            return JsonSerializer.Deserialize<HelperConfig>(bytes, JsonDefaults.Lenient);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Atomically write config.json (temp file + replace) with a current-user ACL.</summary>
    public void Save(string? path = null)
    {
        path = path ?? HelperPaths.ConfigPath();
        string dir = Path.GetDirectoryName(path)!;
        HelperPaths.EnsureDirectory(dir);

        byte[] data = JsonSerializer.SerializeToUtf8Bytes(this, JsonDefaults.Pretty);
        string tmp = Path.Combine(dir, ".config.json.tmp");
        File.WriteAllBytes(tmp, data);
        FilePermissions.RestrictToCurrentUser(tmp, isDirectory: false);

        // Atomic replace: File.Move with overwrite is atomic on the same volume.
        File.Move(tmp, path, overwrite: true);
        // Move can carry over the destination's old ACL; re-assert.
        FilePermissions.RestrictToCurrentUser(path, isDirectory: false);
    }

    /// <summary>
    /// Config with env overrides applied: <c>AGB_CRM_URL</c> / <c>AGB_CRM_TOKEN</c>
    /// take precedence over config.json (simulate mode / CI).
    /// </summary>
    public static HelperConfig Effective(string? path = null, IDictionary<string, string?>? environment = null)
    {
        var config = Load(path) ?? new HelperConfig();
        string? envUrl = environment is not null
            ? environment.TryGetValue("AGB_CRM_URL", out var u) ? u : null
            : Environment.GetEnvironmentVariable("AGB_CRM_URL");
        string? envToken = environment is not null
            ? environment.TryGetValue("AGB_CRM_TOKEN", out var t) ? t : null
            : Environment.GetEnvironmentVariable("AGB_CRM_TOKEN");

        if (!string.IsNullOrEmpty(envUrl)) config.CrmBaseUrl = envUrl;
        if (!string.IsNullOrEmpty(envToken)) config.Token = envToken;
        return config;
    }
}
