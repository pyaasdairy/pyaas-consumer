import Foundation
import CoreLocation

/// The delivery state machine — enum-driven and exhaustive. The single source of
/// truth for order status is shared with the field-ops app via the backend.
enum OrderStatus: String, Sendable, CaseIterable, Codable {
    case placed
    case confirmed
    case preparing
    case assigned
    case outForDelivery = "out_for_delivery"
    case delivered
    case cancelled

    /// The forward flow used by the progress timeline (excludes cancelled).
    static let flow: [OrderStatus] = [.placed, .confirmed, .preparing, .assigned, .outForDelivery, .delivered]

    var title: String {
        switch self {
        case .placed: return String(localized: "Order placed")
        case .confirmed: return String(localized: "Confirmed")
        case .preparing: return String(localized: "Being packed")
        case .assigned: return String(localized: "Rider assigned")
        case .outForDelivery: return String(localized: "On the way")
        case .delivered: return String(localized: "Delivered")
        case .cancelled: return String(localized: "Cancelled")
        }
    }

    var subtitle: String {
        switch self {
        case .placed: return String(localized: "We’ve received your order.")
        case .confirmed: return String(localized: "Your order is confirmed.")
        case .preparing: return String(localized: "Your milk is being packed fresh.")
        case .assigned: return String(localized: "A rider has picked up your order.")
        case .outForDelivery: return String(localized: "Your rider is on the way to you.")
        case .delivered: return String(localized: "Enjoy your PYAAS. See you tomorrow!")
        case .cancelled: return String(localized: "This order was cancelled.")
        }
    }

    var systemImage: String {
        switch self {
        case .placed: return "checkmark.circle"
        case .confirmed: return "doc.text"
        case .preparing: return "shippingbox"
        case .assigned: return "figure.wave"
        case .outForDelivery: return "bicycle"
        case .delivered: return "house"
        case .cancelled: return "xmark.circle"
        }
    }

    var flowIndex: Int { OrderStatus.flow.firstIndex(of: self) ?? 0 }
    var isTerminal: Bool { self == .delivered || self == .cancelled }
    var isLive: Bool { !isTerminal }
}

/// A rider, read from the shared `app_users` table (location updated every few
/// seconds while delivering).
struct Rider: Sendable, Equatable {
    var id: String
    var name: String
    var phone: String?
    var vehicle: String?
    var rating: Double?
    var coordinate: CLLocationCoordinate2D?

    static func == (lhs: Rider, rhs: Rider) -> Bool {
        lhs.id == rhs.id && lhs.coordinate?.latitude == rhs.coordinate?.latitude
            && lhs.coordinate?.longitude == rhs.coordinate?.longitude
    }
}

/// An order in the consumer's history / live tracking.
struct Order: Identifiable, Sendable, Equatable, Hashable {
    var id: String
    var code: String
    var status: OrderStatus
    var placedAt: Date
    var etaMinutes: Int?
    var total: Money
    var itemSummary: String
    var addressLine: String
    var destination: CLLocationCoordinate2D?
    var batchCode: String?
    var rider: Rider?
    var proofPhotoURL: URL?

    static func == (lhs: Order, rhs: Order) -> Bool {
        lhs.id == rhs.id && lhs.status == rhs.status && lhs.rider == rhs.rider
            && lhs.etaMinutes == rhs.etaMinutes
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Permissive decode of an `orders` row — the consumer table carries more
/// columns than we render; we read the ones the tracking UI needs.
struct OrderDTO: Decodable {
    var id: String?
    var code: String?
    var status: String?
    var createdAt: String?
    var total: Double?
    var amount: Double?
    var etaMinutes: Int?
    var batchCode: String?
    var addressLine: String?
    var proofPhotoUrl: String?
}
