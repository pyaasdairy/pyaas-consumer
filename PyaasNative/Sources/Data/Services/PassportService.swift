import Foundation

/// Resolves passports from the live backend. Everything fails soft: if a token
/// doesn't verify or no session exists, callers fall back to authored content
/// so the hero is never empty.
struct PassportService: Sendable {
    var client: SupabaseClient = .shared

    private static let snakeDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    /// Resolve a scanned QR token against the anon-safe `get_milk_passport` RPC.
    /// Returns `nil` when the token doesn't verify.
    func passport(forToken token: String) async throws -> Passport? {
        let dto = try await client.rpc("get_milk_passport", params: ["p_token": .string(token)], as: TokenPassportDTO.self)
        return Passport.from(token: dto)
    }

    /// The signed-in customer's most recent delivered batch.
    func latestPassport() async throws -> Passport? {
        let data = try await client.rpcData("my_milk_passport")
        if let array = try? Self.snakeDecoder.decode([MyPassportDTO].self, from: data), let first = array.first {
            return Passport.from(latest: first)
        }
        if let object = try? Self.snakeDecoder.decode(MyPassportDTO.self, from: data) {
            return Passport.from(latest: object)
        }
        return nil
    }
}

/// Extract a passport token from a scanned QR payload. Accepts a raw token, a
/// `pyaas://trace/<token>` deep link, or a `https://…/<token>` URL — mirrors the
/// field/web apps so the same QR works everywhere.
enum QRPayload {
    static func token(from payload: String) -> String? {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let tail = trimmed.split(whereSeparator: { "/?#".contains($0) }).last.map(String.init) ?? trimmed
        let candidate = tail.isEmpty ? trimmed : tail
        let valid = candidate.range(of: "^[A-Za-z0-9_-]{6,}$", options: .regularExpression) != nil
        return valid ? candidate : nil
    }
}
