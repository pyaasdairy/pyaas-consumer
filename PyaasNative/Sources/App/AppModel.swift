import SwiftUI
import Observation

/// The app's single source of UI truth: cart, recent scans, and session. Held
/// once at the root and shared via the environment. Cart and recents survive
/// relaunch (UserDefaults, JSON). Network work lives in the services it owns.
@MainActor
@Observable
final class AppModel {
    var cart = Cart() { didSet { save(cart, key: .cart) } }
    var recentScans: [Passport] = [] { didSet { save(recentScans, key: .recents) } }
    var isSignedIn = false
    var profile = Profile.guest

    let passportService = PassportService()
    let orderService = OrderService()

    private enum Key: String { case cart = "pyaas.cart.v1"; case recents = "pyaas.recents.v1" }

    init() {
        cart = Self.load(Cart.self, key: .cart) ?? Cart()
        recentScans = Self.load([Passport].self, key: .recents) ?? []
        Task { await refreshSession() }
    }

    // MARK: Scans

    /// Record a freshly resolved passport at the top of recents (de-duplicated by
    /// batch, capped at 12).
    func recordScan(_ passport: Passport) {
        guard passport.source != .sample else { return }
        recentScans.removeAll { $0.batchCode == passport.batchCode }
        recentScans.insert(passport, at: 0)
        if recentScans.count > 12 { recentScans = Array(recentScans.prefix(12)) }
    }

    /// Resolve a scanned QR payload to a verified passport.
    func resolveScan(_ payload: String) async throws -> Passport {
        guard let token = QRPayload.token(from: payload) else { throw APIError.message("That QR code isn’t a PYAAS pack.") }
        if let passport = try await passportService.passport(forToken: token) {
            recordScan(passport)
            return passport
        }
        throw APIError.message("We couldn’t verify that pack. Try scanning again in good light.")
    }

    /// The passport shown on Home / Know-Your-Milk: the signed-in customer's
    /// latest batch, the most recent scan, or the authored sample.
    func featuredPassport() async -> Passport {
        if isSignedIn, let latest = try? await passportService.latestPassport() {
            return latest
        }
        return recentScans.first ?? SampleData.passport
    }

    // MARK: Cart

    func addToCart(_ productID: String, qty: Int = 1) {
        cart.add(productID, qty: qty)
    }

    // MARK: Session

    /// True when the signed-in email is on the admin allowlist. A UI gate; the
    /// backend still enforces real admin access via RLS.
    var isAdmin: Bool { AppConfig.isAdmin(profile.email) }

    func refreshSession() async {
        isSignedIn = await SupabaseClient.shared.isSignedIn
        if isSignedIn {
            let id = await SupabaseClient.shared.currentUserID
            let email = await SupabaseClient.shared.currentUserEmail
            let name = email.map { String($0.split(separator: "@").first ?? "PYAAS Member").capitalized } ?? String(localized: "PYAAS Member")
            profile = Profile(id: id ?? "", name: name, email: email,
                              phone: nil, isVIP: false, vipTrialDaysLeft: nil, wallet: .zero)
        } else {
            profile = .guest
        }
    }

    func signOut() {
        Task {
            await SupabaseClient.shared.signOut()
            await refreshSession()
        }
    }

    // MARK: Persistence

    private func save<T: Encodable>(_ value: T, key: Key) {
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: key.rawValue)
        }
    }

    private static func load<T: Decodable>(_ type: T.Type, key: Key) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key.rawValue) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
