import Foundation

/// Typed, humane errors. Views never see a raw `Error` — they map to a branded
/// error state with Retry.
enum APIError: Error, Equatable {
    case notConfigured
    case network
    case decoding
    case server(status: Int)
    case unauthorized
    case message(String)

    var isRetryable: Bool {
        switch self {
        case .network, .server: return true
        case .notConfigured, .decoding, .unauthorized, .message: return false
        }
    }

    /// A humane, user-facing message. Views never show a raw error.
    var userText: String {
        switch self {
        case .notConfigured: return String(localized: "The app isn’t connected to a backend yet.")
        case .network: return String(localized: "You appear to be offline. Check your connection.")
        case .decoding: return String(localized: "We got an unexpected response. Please try again.")
        case .server: return String(localized: "Our service is having a moment. Please try again.")
        case .unauthorized: return String(localized: "Please sign in to see this.")
        case .message(let text): return text
        }
    }
}

/// A small, `Sendable` JSON value for RPC parameters — keeps the actor boundary
/// clean without reaching for `[String: Any]`.
enum JSON: Sendable, Encodable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
}

/// A Supabase auth session.
struct AuthSession: Sendable, Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let userID: String
    let email: String?
    let phone: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case user
    }

    struct UserDTO: Codable { let id: String; let email: String?; let phone: String? }

    init(accessToken: String, refreshToken: String, userID: String, email: String?, phone: String?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.userID = userID
        self.email = email
        self.phone = phone
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        let user = try c.decode(UserDTO.self, forKey: .user)
        userID = user.id
        email = user.email
        phone = user.phone
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken)
        try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(UserDTO(id: userID, email: email, phone: phone), forKey: .user)
    }
}

/// Shared ISO-8601 parsing for `timestamptz` strings (with and without
/// fractional seconds).
enum ISODate {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        return withFraction.date(from: string) ?? plain.date(from: string)
    }
}
