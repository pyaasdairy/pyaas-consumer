import SwiftUI

/// A product tile for the shop grid: the real product shot on a soft wash, price
/// with MRP strikethrough + savings, and an Add control that becomes a stepper.
struct ProductCard: View {
    let product: Product
    let qty: Int
    let onOpen: () -> Void
    let onAdd: () -> Void
    let onChange: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Button(action: onOpen) {
                ZStack(alignment: .topLeading) {
                    Image(product.imageName)
                        .resizable()
                        .scaledToFit()
                        .padding(Space.md)
                        .frame(maxWidth: .infinity)
                        .frame(height: 130)
                        .background(PyaasColor.wash, in: RoundedRectangle.pyaas(Radius.image))

                    if let discount = product.discountPercent {
                        Text("\(discount)% off")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, Space.sm).padding(.vertical, 3)
                            .background(PyaasColor.berry, in: Capsule())
                            .padding(Space.sm)
                    }
                }
            }
            .buttonStyle(PressScale())

            VStack(alignment: .leading, spacing: 1) {
                Text(product.name).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text(product.variant).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }

            HStack(alignment: .firstTextBaseline, spacing: Space.xs) {
                Text(product.price.formatted).textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                if let mrp = product.mrp {
                    Text(mrp.formatted)
                        .textRole(.caption)
                        .foregroundStyle(PyaasColor.inkMute)
                        .strikethrough()
                }
            }

            addControl
        }
        .padding(Space.md)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
        .pyaasShadow(.soft)
    }

    @ViewBuilder private var addControl: some View {
        if qty == 0 {
            Button {
                Haptics.medium()
                onAdd()
            } label: {
                Text("Add")
                    .textRole(.button)
                    .foregroundStyle(PyaasColor.roseDeep)
                    .frame(maxWidth: .infinity)
                    .frame(height: 36)
                    .background(PyaasColor.roseSoft, in: Capsule())
            }
            .buttonStyle(PressScale())
            .accessibilityLabel("Add \(product.name) to cart")
        } else {
            QuantityStepper(qty: qty, onChange: onChange)
                .frame(maxWidth: .infinity)
        }
    }
}
