import Foundation

/// The signed-in customer. Minimal by design — accounts exist only to power
/// loyalty, reorder, and live tracking.
struct Profile: Sendable, Equatable {
    var id: String
    var name: String
    var email: String?
    var phone: String?
    var isVIP: Bool
    var vipTrialDaysLeft: Int?
    var wallet: Money

    static let guest = Profile(id: "", name: "Guest", email: nil, phone: nil, isVIP: false, vipTrialDaysLeft: nil, wallet: .zero)
}
