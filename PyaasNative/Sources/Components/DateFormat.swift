import Foundation

/// Locale-aware date rendering for the passport and orders. All timestamps are
/// ISO-8601 UTC on the wire; we present them in the user's locale (en_IN by
/// default for the pilot).
enum DateFormat {
    private static let locale = Locale(identifier: "en_IN")

    /// "14 Jun, 6:40 AM"
    static func dayTime(_ date: Date?) -> String {
        guard let date else { return "—" }
        return date.formatted(
            .dateTime.locale(locale).day().month(.abbreviated).hour().minute()
        )
    }

    /// "6:40 AM"
    static func time(_ date: Date?) -> String {
        guard let date else { return "—" }
        return date.formatted(.dateTime.locale(locale).hour().minute())
    }

    /// "14 June 2026"
    static func longDate(_ date: Date?) -> String {
        guard let date else { return "—" }
        return date.formatted(.dateTime.locale(locale).day().month(.wide).year())
    }

    /// "32 min ago"
    static func relative(_ date: Date?) -> String {
        guard let date else { return "—" }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
