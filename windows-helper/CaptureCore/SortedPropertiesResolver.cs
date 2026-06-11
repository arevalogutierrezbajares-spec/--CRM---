using System.Text.Json.Serialization.Metadata;

namespace AGB.CaptureCore;

/// <summary>
/// A <see cref="DefaultJsonTypeInfoResolver"/> that emits object properties in
/// alphabetical order by their serialized JSON name. This reproduces the macOS
/// helper's <c>JSONEncoder.OutputFormatting.sortedKeys</c> so config.json and
/// manifest.json are byte-stable and diff-friendly regardless of declaration
/// order.
/// </summary>
public sealed class SortedPropertiesResolver : DefaultJsonTypeInfoResolver
{
    public override JsonTypeInfo GetTypeInfo(Type type, System.Text.Json.JsonSerializerOptions options)
    {
        JsonTypeInfo info = base.GetTypeInfo(type, options);
        if (info.Kind == JsonTypeInfoKind.Object && info.Properties.Count > 1)
        {
            var ordered = info.Properties
                .OrderBy(p => p.Name, StringComparer.Ordinal)
                .ToList();
            info.Properties.Clear();
            foreach (var prop in ordered)
                info.Properties.Add(prop);
        }
        return info;
    }
}
