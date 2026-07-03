import Foundation

/// The app's single backend door: one actor that talks to Supabase over
/// `async/await` `URLSession`. It carries the public anon key on every request
/// and a bearer token once the user signs in. No privileged secret is ever held
/// here — Row-Level Security gates every table server-side.
///
/// This is the *only* place that builds requests. Services call typed helpers;
/// views call services. Secrets in, never out.
actor SupabaseClient {
    static let shared = SupabaseClient()

    private let baseURL = AppConfig.supabaseURL
    private let anonKey = AppConfig.supabaseAnonKey
    private let session: URLSession
    private var sessionToken: AuthSession?

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 25
        config.waitsForConnectivity = true
        config.urlCache = URLCache(memoryCapacity: 8 << 20, diskCapacity: 64 << 20)
        self.session = URLSession(configuration: config)
        if let data = KeychainStore.read("session"),
           let restored = try? JSONDecoder().decode(AuthSession.self, from: data) {
            self.sessionToken = restored
        }
    }

    // MARK: Session

    var currentUserID: String? { sessionToken?.userID }
    var currentUserEmail: String? { sessionToken?.email }
    var isSignedIn: Bool { sessionToken != nil }

    func persist(_ session: AuthSession) {
        self.sessionToken = session
        if let data = try? JSONEncoder().encode(session) {
            KeychainStore.save(data, for: "session")
        }
    }

    func signOut() {
        sessionToken = nil
        KeychainStore.delete("session")
    }

    // MARK: REST — PostgREST

    /// `GET /rest/v1/{table}` with PostgREST query items. Decodes an array.
    func select<T: Decodable>(_ table: String, _ query: [URLQueryItem], as type: T.Type) async throws -> [T] {
        guard AppConfig.isConfigured else { throw APIError.notConfigured }
        var comps = URLComponents(url: baseURL.appendingPathComponent("rest/v1/\(table)"), resolvingAgainstBaseURL: false)!
        comps.queryItems = query
        var request = URLRequest(url: comps.url!)
        request.httpMethod = "GET"
        applyHeaders(&request)
        let data = try await perform(request)
        do { return try decoder.decode([T].self, from: data) }
        catch { throw APIError.decoding }
    }

    /// `POST /rest/v1/rpc/{fn}` — decode the result as a concrete type.
    func rpc<T: Decodable>(_ function: String, params: [String: JSON] = [:], as type: T.Type) async throws -> T {
        let data = try await rpcData(function, params: params)
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decoding }
    }

    /// `POST /rest/v1/rpc/{fn}` — raw bytes (callers that branch on array vs.
    /// object shapes).
    func rpcData(_ function: String, params: [String: JSON] = [:]) async throws -> Data {
        guard AppConfig.isConfigured else { throw APIError.notConfigured }
        var request = URLRequest(url: baseURL.appendingPathComponent("rest/v1/rpc/\(function)"))
        request.httpMethod = "POST"
        applyHeaders(&request)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(params)
        return try await perform(request)
    }

    // MARK: Auth — GoTrue

    /// Request an email OTP (6-digit code). Requires "Confirm email" / email OTP
    /// enabled in Supabase Auth; surfaces a humane error otherwise.
    func requestEmailOTP(email: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/v1/otp"))
        request.httpMethod = "POST"
        applyHeaders(&request, authedOnly: false)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // create_user:true so first-time emails are provisioned on verify.
        request.httpBody = try JSONEncoder().encode(["email": email, "create_user": "true"])
        _ = try await perform(request)
    }

    /// Verify an email OTP, returning (and persisting) a session.
    @discardableResult
    func verifyEmailOTP(email: String, code: String) async throws -> AuthSession {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/v1/verify"))
        request.httpMethod = "POST"
        applyHeaders(&request, authedOnly: false)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email, "token": code, "type": "email"])
        let data = try await perform(request)
        do {
            let authed = try JSONDecoder().decode(AuthSession.self, from: data)
            persist(authed)
            return authed
        } catch {
            throw APIError.message("That code didn’t match. Please try again.")
        }
    }

    // MARK: Plumbing

    private func applyHeaders(_ request: inout URLRequest, authedOnly: Bool = true) {
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        let bearer = (authedOnly ? sessionToken?.accessToken : nil) ?? anonKey
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        switch http.statusCode {
        case 200...299:
            return data
        case 401, 403:
            throw APIError.unauthorized
        default:
            throw APIError.server(status: http.statusCode)
        }
    }
}
