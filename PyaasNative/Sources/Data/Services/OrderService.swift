import Foundation

/// Reads the customer's orders (RLS-gated — anon gets nothing, which the UI
/// handles by showing the authored sample so the Uber-style tracking is always
/// demoable).
struct OrderService: Sendable {
    var client: SupabaseClient = .shared

    func myOrders() async throws -> [Order] {
        try await orders(limit: 20)
    }

    /// All orders the session is permitted to read. For an admin (granted by RLS
    /// server-side) this is every order; for a normal user it's just theirs.
    func allOrders(limit: Int = 50) async throws -> [Order] {
        try await orders(limit: limit)
    }

    private func orders(limit: Int) async throws -> [Order] {
        let query = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        let dtos = try await client.select("orders", query, as: OrderDTO.self)
        return dtos.compactMap(Self.map)
    }

    static func map(_ dto: OrderDTO) -> Order? {
        guard let id = dto.id else { return nil }
        let status = dto.status.flatMap(OrderStatus.init(rawValue:)) ?? .placed
        let rupees = dto.total ?? dto.amount ?? 0
        return Order(
            id: id,
            code: dto.code ?? "PYS-\(id.prefix(4).uppercased())",
            status: status,
            placedAt: ISODate.parse(dto.createdAt) ?? Date(),
            etaMinutes: dto.etaMinutes,
            total: Money(paise: Int((rupees * 100).rounded())),
            itemSummary: String(localized: "Your PYAAS order"),
            addressLine: dto.addressLine ?? "",
            destination: nil,
            batchCode: dto.batchCode,
            rider: nil,
            proofPhotoURL: dto.proofPhotoUrl.flatMap(URL.init(string:))
        )
    }
}
