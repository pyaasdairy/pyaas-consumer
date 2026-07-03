import SwiftUI

/// Bill math for the cart and checkout. Delivery is free over ₹199. All money is
/// integer paise via `Money`.
struct Billing {
    let subtotal: Money
    let savings: Money
    let deliveryFee: Money
    let total: Money

    static let freeDeliveryThreshold = Money(rupees: 199)
    static let deliveryCharge = Money(rupees: 15)

    init(cart: Cart) {
        subtotal = cart.subtotal
        savings = cart.savings
        deliveryFee = (cart.isEmpty || subtotal >= Self.freeDeliveryThreshold) ? .zero : Self.deliveryCharge
        total = subtotal + deliveryFee
    }
}

/// Payment methods. The gateway is stubbed behind `PaymentGateway` so a real
/// Razorpay / UPI integration drops in without touching the UI. Per Apple policy,
/// physical goods stay on the external gateway (not IAP).
enum PaymentMethod: String, CaseIterable, Identifiable {
    case wallet, upi, card, cod
    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .wallet: return "PYAAS Wallet"
        case .upi: return "UPI"
        case .card: return "Card"
        case .cod: return "Cash / UPI on delivery"
        }
    }

    var icon: String {
        switch self {
        case .wallet: return "wallet.bifold"
        case .upi: return "indianrupeesign.circle"
        case .card: return "creditcard"
        case .cod: return "banknote"
        }
    }
}

/// The boundary a real gateway implements. The scaffold uses `StubGateway`.
protocol PaymentGateway: Sendable {
    func pay(_ amount: Money, method: PaymentMethod) async throws
}

struct StubGateway: PaymentGateway {
    func pay(_ amount: Money, method: PaymentMethod) async throws {
        // Simulates a gateway round-trip; a real implementation verifies
        // server-side before the order is confirmed.
        try await Task.sleep(for: .milliseconds(900))
    }
}
