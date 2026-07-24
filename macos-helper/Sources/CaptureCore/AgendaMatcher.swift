import Foundation

/// On-device keyword matching of agenda items against the live transcript
/// (El Cuaderno Slice 3 "agenda glow"). Pure + testable. When a spoken line
/// mentions an agenda topic, its rail dot lights ◐ (touched) in real time —
/// so three dark dots at minute 20 is a visible nudge to raise them before the
/// call ends. Coverage stays operator-driven (● done is a click); this only
/// suggests ◐ and never marks anything done.
public enum AgendaMatcher {

    private static let stopwords: Set<String> = [
        "the", "and", "for", "with", "review", "call", "plan", "item", "list",
        "our", "your", "their", "about", "into", "que", "los", "las", "del",
        "para", "con", "una", "uno", "sobre",
    ]

    /// Content keywords of an agenda label: lowercased words ≥4 chars, minus
    /// stopwords. "Escort licensing (Bolívar)" → ["escort","licensing","bolivar"].
    public static func keywords(for label: String) -> [String] {
        label.lowercased()
            .folding(options: .diacriticInsensitive, locale: nil)
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count >= 4 && !stopwords.contains($0) }
    }

    /// Agenda item keys whose topic the line mentions. Whole-word match on any
    /// keyword (so "price" doesn't fire "enterprise"). Case/diacritic-folded.
    public static func matches(line: String,
                               agenda: [(key: String, label: String)]) -> [String] {
        let hay = " " + line.lowercased()
            .folding(options: .diacriticInsensitive, locale: nil)
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .joined(separator: " ") + " "
        var hits: [String] = []
        for item in agenda {
            let kws = keywords(for: item.label)
            if kws.contains(where: { hay.contains(" \($0) ") }) {
                hits.append(item.key)
            }
        }
        return hits
    }
}
