import Foundation

/// #theme parsing for the Call Desk composer (El Cuaderno Slice 1).
///
/// A note like "wire deposit #payment-terms" carries the operator's own theme
/// tag; the FIRST tag becomes the marker's `themeKey` (single-bucket filing),
/// tags are stripped from the stored text, and unknown tags simply create a
/// live theme server-side. No tag ⇒ the note stays untagged (the inbox).
public enum ThemeTags {

    /// Slug rules shared with the server: lowercase a–z0–9 and hyphens, ≤48.
    public static func slugify(_ label: String) -> String {
        let lowered = label.lowercased()
            .folding(options: .diacriticInsensitive, locale: nil)
        var out = ""
        var lastHyphen = true // suppress leading hyphen
        for ch in lowered {
            if ch.isLetter || ch.isNumber {
                out.append(ch)
                lastHyphen = false
            } else if !lastHyphen {
                out.append("-")
                lastHyphen = true
            }
            if out.count >= 48 { break }
        }
        while out.hasSuffix("-") { out.removeLast() }
        return out
    }

    /// Extract `#tags` from composer text. Returns the cleaned text (tags
    /// removed, whitespace collapsed) plus all valid tag slugs in order.
    /// A "#" must start a token (preceded by start/whitespace) to count —
    /// "issue #42" tags "42"? No: purely-numeric tags are ignored so ticket
    /// numbers survive as text.
    public static func parse(_ raw: String) -> (text: String, tags: [String]) {
        var tags: [String] = []
        var keptTokens: [String] = []
        for token in raw.split(separator: " ", omittingEmptySubsequences: true) {
            if token.first == "#", token.count > 1 {
                let candidate = slugify(String(token.dropFirst()))
                let isNumericOnly = candidate.allSatisfy { $0.isNumber || $0 == "-" }
                if !candidate.isEmpty, !isNumericOnly {
                    if !tags.contains(candidate) { tags.append(candidate) }
                    continue // tag token is stripped from the text
                }
            }
            keptTokens.append(String(token))
        }
        return (keptTokens.joined(separator: " ").trimmingCharacters(in: .whitespaces), tags)
    }

    /// De-slug for display when a live tag creates a theme ("payment-terms" →
    /// "Payment terms").
    public static func label(fromSlug slug: String) -> String {
        let words = slug.split(separator: "-").map(String.init)
        guard let first = words.first, !first.isEmpty else { return slug }
        return ([first.prefix(1).uppercased() + first.dropFirst()] + words.dropFirst())
            .joined(separator: " ")
    }
}
