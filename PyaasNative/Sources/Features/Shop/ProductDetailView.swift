import SwiftUI

/// Product detail with a generous hero image, the trust story, and a sticky
/// add-to-cart bar that follows you.
struct ProductDetailView: View {
    let product: Product
    @Binding var path: NavigationPath
    @Environment(AppModel.self) private var model

    private var qty: Int { model.cart.qty(of: product.id) }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    Image(product.imageName)
                        .resizable().scaledToFit()
                        .padding(Space.xl)
                        .frame(maxWidth: .infinity)
                        .frame(height: 300)
                        .background(PyaasColor.wash, in: RoundedRectangle.pyaas(Radius.sheet))

                    VStack(alignment: .leading, spacing: Space.sm) {
                        Pill(text: product.tag, foreground: PyaasColor.berry, background: PyaasColor.roseSoft)
                        Text(product.name).textRole(.heroSerif).foregroundStyle(PyaasColor.ink)
                        Text(product.variant).textRole(.body).foregroundStyle(PyaasColor.inkMute)
                    }

                    HStack(alignment: .firstTextBaseline, spacing: Space.sm) {
                        Text(product.price.formatted).textRole(.displaySerif).foregroundStyle(PyaasColor.ink)
                        if let mrp = product.mrp {
                            Text(mrp.formatted).textRole(.body).foregroundStyle(PyaasColor.inkMute).strikethrough()
                            if let discount = product.discountPercent {
                                Pill(text: "Save \(discount)%", foreground: PyaasColor.berry, background: PyaasColor.roseSoft)
                            }
                        }
                    }

                    Text(product.summary)
                        .textRole(.body).foregroundStyle(PyaasColor.inkSoft)

                    trustList

                    if product.subscribable {
                        subscribeHint
                    }
                }
                .padding(.horizontal, Space.xl)
                .padding(.top, Space.sm)
                .padding(.bottom, 140)
            }
            .scrollIndicators(.hidden)

            addBar
        }
        .background(PyaasColor.background.ignoresSafeArea())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var trustList: some View {
        Card(elevation: .soft) {
            VStack(alignment: .leading, spacing: Space.md) {
                trustRow("checkmark.seal.fill", "Traceable to the farm", "Scan the pack to meet your farmers.")
                Divider()
                trustRow("drop.fill", "Tested every batch", "Fat, SNF and adulteration, lab-verified.")
                Divider()
                trustRow("thermometer.snowflake", "Cold chain kept", "Chilled within the hour, all the way to you.")
            }
        }
    }

    private func trustRow(_ icon: String, _ title: LocalizedStringKey, _ detail: LocalizedStringKey) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: icon).font(.headline).foregroundStyle(PyaasColor.roseDeep).frame(width: 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text(detail).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            Spacer()
        }
    }

    private var subscribeHint: some View {
        HStack(spacing: Space.md) {
            Image(systemName: "repeat").font(.headline).foregroundStyle(PyaasColor.berry)
            VStack(alignment: .leading, spacing: 1) {
                Text("Make it a subscription").textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text("Daily or alternate days, paused whenever you travel.").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            Spacer()
        }
        .padding(Space.lg)
        .background(PyaasColor.roseSoft.opacity(0.5), in: RoundedRectangle.pyaas(Radius.card))
    }

    private var addBar: some View {
        HStack(spacing: Space.lg) {
            if qty > 0 {
                QuantityStepper(qty: qty, onChange: { value in withAnimation(Motion.snappy) { model.cart.setQty(product.id, value) } })
                    .frame(height: 52)
                    .padding(.horizontal, Space.sm)
                    .background(PyaasColor.surface, in: Capsule())
                    .overlay(Capsule().strokeBorder(PyaasColor.hairline, lineWidth: 1))
                PyaasButton("Go to cart", systemImage: "bag.fill") {
                    path.append(ShopRoute.cart)
                }
            } else {
                PyaasButton("Add to cart  ·  \(product.price.formatted)", systemImage: "bag.badge.plus") {
                    withAnimation(Motion.snappy) { model.addToCart(product.id) }
                }
            }
        }
        .padding(.horizontal, Space.xl)
        .padding(.top, Space.md)
        .padding(.bottom, Space.xl)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }
}
