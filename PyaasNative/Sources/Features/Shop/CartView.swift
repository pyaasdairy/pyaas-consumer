import SwiftUI

/// The cart: editable lines, a clear bill, and one primary action to checkout.
struct CartView: View {
    @Binding var path: NavigationPath
    @Environment(AppModel.self) private var model

    private var billing: Billing { Billing(cart: model.cart) }

    var body: some View {
        ZStack(alignment: .bottom) {
            if model.cart.isEmpty {
                EmptyState(systemImage: "bag",
                           title: "Your cart is empty",
                           message: "Add some fresh milk and it’ll show up here.",
                           ctaTitle: String(localized: "Browse the shop")) {
                    path = NavigationPath()
                }
            } else {
                ScrollView {
                    VStack(spacing: Space.lg) {
                        ForEach(model.cart.lines) { line in
                            if let product = Catalog.product(line.productID) {
                                cartRow(product: product, qty: line.qty)
                            }
                        }
                        billCard
                    }
                    .padding(.horizontal, Space.xl)
                    .padding(.top, Space.lg)
                    .padding(.bottom, 140)
                }
                .scrollIndicators(.hidden)

                checkoutBar
            }
        }
        .background(PyaasColor.background.ignoresSafeArea())
        .navigationTitle("Cart")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func cartRow(product: Product, qty: Int) -> some View {
        HStack(spacing: Space.lg) {
            Image(product.imageName)
                .resizable().scaledToFit()
                .padding(Space.xs)
                .frame(width: 64, height: 64)
                .background(PyaasColor.wash, in: RoundedRectangle.pyaas(Radius.image))

            VStack(alignment: .leading, spacing: 2) {
                Text(product.name).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text(product.variant).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                Text((product.price * qty).formatted).textRole(.bodyStrong).foregroundStyle(PyaasColor.roseDeep)
            }
            Spacer()
            QuantityStepper(qty: qty, onChange: { value in withAnimation(Motion.snappy) { model.cart.setQty(product.id, value) } })
        }
        .padding(Space.md)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
        .pyaasShadow(.soft)
    }

    private var billCard: some View {
        Card {
            VStack(spacing: Space.md) {
                billRow("Item total", billing.subtotal.formatted)
                if billing.savings.paise > 0 {
                    billRow("You save", "− " + billing.savings.formatted, tint: PyaasColor.berry)
                }
                billRow("Delivery", billing.deliveryFee.paise == 0 ? String(localized: "Free") : billing.deliveryFee.formatted)
                Divider()
                HStack {
                    Text("To pay").textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                    Spacer()
                    Text(billing.total.formatted).textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                }
            }
        }
    }

    private func billRow(_ label: LocalizedStringKey, _ value: String, tint: Color = PyaasColor.inkSoft) -> some View {
        HStack {
            Text(label).textRole(.body).foregroundStyle(PyaasColor.inkSoft)
            Spacer()
            Text(value).textRole(.bodyStrong).foregroundStyle(tint)
        }
    }

    private var checkoutBar: some View {
        HStack(spacing: Space.lg) {
            VStack(alignment: .leading, spacing: 0) {
                Text(billing.total.formatted).textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                Text("\(model.cart.itemCount) items").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            PyaasButton("Checkout", systemImage: "arrow.right") {
                path.append(ShopRoute.checkout)
            }
        }
        .padding(.horizontal, Space.xl)
        .padding(.top, Space.md)
        .padding(.bottom, Space.xl)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }
}
