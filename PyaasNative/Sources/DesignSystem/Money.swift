import Foundation

/// Money is integer **paise** end-to-end — never a float touches currency. The
/// local catalog is denominated in whole rupees, so it is lifted to paise at the
/// boundary; any amount that arrives from the backend in paise is used directly.
/// Formatting is always `en_IN` (₹, lakh/crore grouping).
struct Money: Equatable, Hashable, Sendable, Comparable {
    let paise: Int

    init(paise: Int) { self.paise = paise }
    init(rupees: Int) { self.paise = rupees * 100 }

    static let zero = Money(paise: 0)

    var rupeesValue: Decimal { Decimal(paise) / 100 }

    /// `₹139` when whole, `₹139.50` when there are paise.
    var formatted: String {
        let fractionDigits = paise % 100 == 0 ? 0 : 2
        return rupeesValue.formatted(
            .currency(code: "INR")
                .locale(Locale(identifier: "en_IN"))
                .precision(.fractionLength(fractionDigits))
        )
    }

    static func + (lhs: Money, rhs: Money) -> Money { Money(paise: lhs.paise + rhs.paise) }
    static func - (lhs: Money, rhs: Money) -> Money { Money(paise: lhs.paise - rhs.paise) }
    static func * (lhs: Money, qty: Int) -> Money { Money(paise: lhs.paise * qty) }
    static func < (lhs: Money, rhs: Money) -> Bool { lhs.paise < rhs.paise }
}

extension Sequence where Element == Money {
    func total() -> Money { reduce(Money.zero, +) }
}
