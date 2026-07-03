import Foundation

/// Reads the one-line backend configuration injected from `Config/Pyaas.xcconfig`
/// into `Info.plist`. The Supabase anon key is public by design (gated by
/// Row-Level Security server-side); no privileged secret ever ships in the app.
enum AppConfig {
    /// Supabase REST/Auth base, e.g. `https://<ref>.supabase.co`.
    /// The host is stored without a scheme in xcconfig (where `//` starts a
    /// comment); we prepend `https://` here.
    static let supabaseURL: URL = {
        let host = info("SUPABASE_HOST") ?? "localhost"
        return URL(string: "https://\(host)") ?? URL(string: "https://localhost")!
    }()

    static let supabaseAnonKey: String = info("SUPABASE_ANON_KEY") ?? ""

    /// Emails that unlock the in-app Admin panel (comma-separated in xcconfig).
    /// A UI gate only — the DB enforces real admin access via RLS server-side.
    static let adminEmails: Set<String> = {
        let raw = info("ADMIN_EMAILS") ?? ""
        return Set(raw.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty })
    }()

    static func isAdmin(_ email: String?) -> Bool {
        guard let email = email?.trimmingCharacters(in: .whitespaces).lowercased(), !email.isEmpty else { return false }
        return adminEmails.contains(email)
    }

    /// True only when both values are present, so the UI can show a calm
    /// "backend not configured" state instead of failing opaquely.
    static var isConfigured: Bool {
        guard let host = info("SUPABASE_HOST"), !host.isEmpty, host != "localhost" else { return false }
        return !supabaseAnonKey.isEmpty
    }

    private static func info(_ key: String) -> String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
