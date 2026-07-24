import Foundation

/// On-device detection of literal spoken commitments in the live transcript
/// (El Cuaderno Slice 3 "commitment whisper"). Pure + testable; NO model, NO
/// network — a regex over finalized lines. When a speaker says a first-person
/// future commitment ("I'll send the doc Friday"), the Call Desk surfaces a
/// dismissible chip the operator can adopt as a note with one keystroke.
///
/// Precision-safe by construction: it only fires on explicit commitment verbs,
/// never judges importance, and every hit is a suggestion the operator accepts
/// or ignores. Bilingual (EN + ES) since these are Venezuela calls.
public enum CommitmentDetector {

    /// A detected commitment candidate: the clause worth noting + the raw line.
    public struct Candidate: Equatable {
        /// The trimmed sentence/clause that carried the commitment.
        public let clause: String
        public init(clause: String) { self.clause = clause }
    }

    // First-person future-commitment openers. Word-boundary anchored so
    // "will" inside "willing" or a bare "can" never fire.
    private static let patterns: [String] = [
        // English
        #"\bI['’]?ll\b"#,
        #"\bwe['’]?ll\b"#,
        #"\bI will\b"#,
        #"\bwe will\b"#,
        #"\bI'?m going to\b"#,
        #"\bwe'?re going to\b"#,
        #"\blet me\b"#,
        #"\bI'?ll send\b"#,
        #"\bI'?ll get (?:you|it|that)\b"#,
        #"\bI'?ll follow up\b"#,
        #"\bI'?ll make sure\b"#,
        #"\bwe can (?:do|get|have|send|deliver)\b"#,
        // Spanish
        #"\bvoy a\b"#,
        #"\bvamos a\b"#,
        #"\bte (?:env[ií]o|mando|paso|entrego)\b"#,
        #"\blo (?:har[eé]|hacemos|env[ií]o|mando)\b"#,
        #"\bnos encargamos\b"#,
        #"\bme encargo\b"#,
        #"\bqued[oa] en\b"#,
    ]

    private static let compiled: [NSRegularExpression] = patterns.compactMap {
        try? NSRegularExpression(pattern: $0, options: [.caseInsensitive])
    }

    /// A commitment reads much stronger when it names a WHEN or a quantity;
    /// used only to rank/annotate, never to gate (the design fires on the verb).
    private static let temporal: NSRegularExpression? = try? NSRegularExpression(
        pattern: #"\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|"#
            + #"next week|this week|by \w+|end of \w+|"#
            + #"hoy|mañana|manana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|"#
            + #"la pr[oó]xima semana|antes del?|"#
            + #"\d{1,2}(:\d{2})?\s?(am|pm|h)?)\b"#,
        options: [.caseInsensitive])

    /// Scan one finalized transcript line. Returns a candidate when it carries
    /// a first-person commitment, else nil. The clause is the whole line
    /// (short lines) or the sentence around the match (long lines).
    public static func scan(line: String) -> Candidate? {
        let text = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 4 else { return nil }
        let full = NSRange(text.startIndex..., in: text)
        guard compiled.contains(where: { $0.firstMatch(in: text, range: full) != nil }) else {
            return nil
        }
        return Candidate(clause: sentenceAround(text))
    }

    /// True when the clause also names a time/date/quantity — a stronger note.
    public static func hasWhen(_ clause: String) -> Bool {
        guard let temporal else { return false }
        let r = NSRange(clause.startIndex..., in: clause)
        return temporal.firstMatch(in: clause, range: r) != nil
    }

    /// Trim a long line down to the sentence containing the commitment, capped.
    private static func sentenceAround(_ text: String) -> String {
        // Split on sentence punctuation; pick the first fragment that still
        // matches a commitment pattern (Deepgram punctuates finals).
        let fragments = text
            .components(separatedBy: CharacterSet(charactersIn: ".!?¡¿"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        for fragment in fragments {
            let r = NSRange(fragment.startIndex..., in: fragment)
            if compiled.contains(where: { $0.firstMatch(in: fragment, range: r) != nil }) {
                return String(fragment.prefix(160))
            }
        }
        return String(text.prefix(160))
    }
}
