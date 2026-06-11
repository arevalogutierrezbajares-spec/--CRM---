using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>
/// Config load/save/effective + completeness. (The Swift helper exercised config
/// only via simulate-mode integration; this gives the pure logic direct cover.)
/// </summary>
public class HelperConfigTests : IDisposable
{
    private readonly string _tempDir;
    private readonly string _configPath;

    public HelperConfigTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"agb-config-tests-{Guid.NewGuid()}");
        Directory.CreateDirectory(_tempDir);
        _configPath = Path.Combine(_tempDir, "config.json");
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* ignore */ }
    }

    [Fact]
    public void SaveThenLoadRoundtrips()
    {
        var config = new HelperConfig
        {
            CrmBaseUrl = "https://x.caneycloud.com",
            Token = "agbcap_abc",
            RetentionNote = "participant informed verbally",
            NeverPromptApps = new List<string> { "Dictation", "SuperWhisper" },
            HelperVersion = "1.0.0",
        };
        config.Save(_configPath);

        var loaded = HelperConfig.Load(_configPath)!;
        Assert.Equal("https://x.caneycloud.com", loaded.CrmBaseUrl);
        Assert.Equal("agbcap_abc", loaded.Token);
        Assert.Equal("participant informed verbally", loaded.RetentionNote);
        Assert.Equal(new[] { "Dictation", "SuperWhisper" }, loaded.NeverPromptApps);
    }

    [Fact]
    public void LoadMissingFileReturnsNull()
    {
        Assert.Null(HelperConfig.Load(Path.Combine(_tempDir, "does-not-exist.json")));
    }

    [Fact]
    public void ToleratesPartialJson()
    {
        File.WriteAllText(_configPath, """{"token":"agbcap_only"}""");
        var loaded = HelperConfig.Load(_configPath)!;
        Assert.Equal("agbcap_only", loaded.Token);
        Assert.Equal("", loaded.CrmBaseUrl);
        Assert.Empty(loaded.NeverPromptApps);
    }

    [Fact]
    public void IsCompleteRequiresUrlAndToken()
    {
        Assert.False(new HelperConfig().IsComplete);
        Assert.False(new HelperConfig { Token = "agbcap_x" }.IsComplete);
        Assert.False(new HelperConfig { CrmBaseUrl = "https://x.com" }.IsComplete);
        Assert.True(new HelperConfig { CrmBaseUrl = "https://x.com", Token = "agbcap_x" }.IsComplete);
        Assert.False(new HelperConfig { CrmBaseUrl = "not a url", Token = "agbcap_x" }.IsComplete);
    }

    [Fact]
    public void EffectiveAppliesEnvOverrides()
    {
        var config = new HelperConfig { CrmBaseUrl = "https://file.example.com", Token = "agbcap_file" };
        config.Save(_configPath);

        var env = new Dictionary<string, string?>
        {
            ["AGB_CRM_URL"] = "https://env.example.com",
            ["AGB_CRM_TOKEN"] = "agbcap_env",
        };
        var effective = HelperConfig.Effective(_configPath, env);
        Assert.Equal("https://env.example.com", effective.CrmBaseUrl);
        Assert.Equal("agbcap_env", effective.Token);
    }
}
