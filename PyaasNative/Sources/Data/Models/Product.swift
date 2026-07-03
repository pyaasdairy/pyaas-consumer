import Foundation

/// The product catalog. Prices mirror pyaasdairy.com's founding prices, lifted
/// to integer paise via `Money`. Images are the same shots used on the web,
/// bundled into the asset catalog.
struct Product: Identifiable, Sendable, Equatable, Hashable {
    enum Category: String, Sendable, CaseIterable { case milk, ghee }

    let id: String
    let name: String
    let variant: String        // "1L Carton"
    let category: Category
    let price: Money
    let mrp: Money?
    let unit: String           // "1 L"
    let tag: String            // short descriptor
    let summary: String
    let imageName: String
    let subscribable: Bool

    var discountPercent: Int? {
        guard let mrp, mrp > price else { return nil }
        let pct = (1 - Double(price.paise) / Double(mrp.paise)) * 100
        return Int(pct.rounded())
    }
}

enum Catalog {
    static let all: [Product] = [
        Product(id: "a2-1l", name: "A2 Cow Milk", variant: "1L Carton", category: .milk,
                price: Money(rupees: 139), mrp: Money(rupees: 169), unit: "1 L",
                tag: "A2 Beta-Casein · 3.5% Fat",
                summary: "Single-origin A2 cow milk from desi cows, gently pasteurised and sealed in a carton. Naturally easy to digest, with the full, creamy taste of real milk.",
                imageName: "product-a2-1l", subscribable: true),
        Product(id: "a2-500ml", name: "A2 Cow Milk", variant: "500ml Carton", category: .milk,
                price: Money(rupees: 75), mrp: Money(rupees: 89), unit: "500 ml",
                tag: "A2 Beta-Casein · 3.5% Fat",
                summary: "The same single-origin A2 cow milk in a handy 500ml carton. Perfect for smaller households and first-time tasters.",
                imageName: "product-a2-500ml", subscribable: true),
        Product(id: "a2-pouch", name: "A2 Cow Milk", variant: "500ml Pouch", category: .milk,
                price: Money(rupees: 69), mrp: nil, unit: "500 ml",
                tag: "A2 Beta-Casein · Daily fresh",
                summary: "Everyday A2 cow milk in a fresh daily pouch. The format your milkman delivers, with traceability built in.",
                imageName: "product-a2-pouch", subscribable: true),
        Product(id: "toned-1l", name: "Toned Milk", variant: "1L Carton", category: .milk,
                price: Money(rupees: 89), mrp: Money(rupees: 119), unit: "1 L",
                tag: "3% Fat · Light & fresh",
                summary: "Wholesome toned milk, standardised for a lighter everyday glass. Great for chai, coffee and growing families.",
                imageName: "product-toned-1l", subscribable: true),
        Product(id: "toned-500ml", name: "Toned Milk", variant: "500ml Carton", category: .milk,
                price: Money(rupees: 49), mrp: Money(rupees: 65), unit: "500 ml",
                tag: "3% Fat · Light & fresh",
                summary: "Toned milk in a 500ml carton, sealed fresh. The lighter choice for your daily routine.",
                imageName: "product-toned-500ml", subscribable: true),
        Product(id: "toned-pouch", name: "Toned Milk", variant: "500ml Pouch", category: .milk,
                price: Money(rupees: 44), mrp: nil, unit: "500 ml",
                tag: "3% Fat · Daily fresh",
                summary: "Daily-fresh toned milk pouch, delivered to your door. Honest milk at an honest price.",
                imageName: "product-toned-pouch", subscribable: true),
        Product(id: "ghee", name: "A2 Bilona Ghee", variant: "500ml Jar", category: .ghee,
                price: Money(rupees: 1099), mrp: Money(rupees: 1499), unit: "500 ml",
                tag: "Hand-churned · Vedic bilona",
                summary: "Golden A2 ghee, hand-churned the traditional bilona way from cultured curd. Nutty, aromatic, and made in small batches.",
                imageName: "product-ghee", subscribable: false),
    ]

    static func product(_ id: String) -> Product? { all.first { $0.id == id } }

    static func filtered(by category: Product.Category?) -> [Product] {
        guard let category else { return all }
        return all.filter { $0.category == category }
    }
}
