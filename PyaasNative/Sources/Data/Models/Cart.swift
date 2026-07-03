import Foundation

/// One line in the cart. Persisted as product id + quantity; prices are always
/// resolved live from the catalog so a price change can't desync.
struct CartLine: Identifiable, Sendable, Equatable, Codable {
    let productID: String
    var qty: Int
    var id: String { productID }
}

/// The cart. Quantities are capped (anti-fat-finger + matches the field rules):
/// 10 of any product, 30 items total.
struct Cart: Sendable, Equatable, Codable {
    var lines: [CartLine] = []

    static let maxPerProduct = 10
    static let maxItems = 30

    var isEmpty: Bool { lines.isEmpty }
    var itemCount: Int { lines.reduce(0) { $0 + $1.qty } }

    func qty(of productID: String) -> Int {
        lines.first { $0.productID == productID }?.qty ?? 0
    }

    var subtotal: Money {
        lines.reduce(Money.zero) { acc, line in
            guard let product = Catalog.product(line.productID) else { return acc }
            return acc + product.price * line.qty
        }
    }

    var savings: Money {
        lines.reduce(Money.zero) { acc, line in
            guard let product = Catalog.product(line.productID), let mrp = product.mrp else { return acc }
            return acc + (mrp - product.price) * line.qty
        }
    }

    mutating func add(_ productID: String, qty delta: Int = 1) {
        guard delta != 0 else { return }
        if let index = lines.firstIndex(where: { $0.productID == productID }) {
            lines[index].qty = clampPerProduct(lines[index].qty + delta)
            if lines[index].qty <= 0 { lines.remove(at: index) }
        } else if delta > 0 && itemCount < Self.maxItems {
            lines.append(CartLine(productID: productID, qty: clampPerProduct(delta)))
        }
    }

    mutating func setQty(_ productID: String, _ qty: Int) {
        let capped = clampPerProduct(qty)
        if capped <= 0 {
            lines.removeAll { $0.productID == productID }
        } else if let index = lines.firstIndex(where: { $0.productID == productID }) {
            lines[index].qty = capped
        } else if itemCount < Self.maxItems {
            lines.append(CartLine(productID: productID, qty: capped))
        }
    }

    mutating func clear() { lines.removeAll() }

    private func clampPerProduct(_ value: Int) -> Int {
        min(max(value, 0), Self.maxPerProduct)
    }
}
