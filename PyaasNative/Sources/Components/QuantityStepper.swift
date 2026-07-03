import SwiftUI

/// A compact +/- stepper with haptics and quantity caps. Animates the count.
struct QuantityStepper: View {
    let qty: Int
    var max: Int = Cart.maxPerProduct
    let onChange: (Int) -> Void

    var body: some View {
        HStack(spacing: 0) {
            stepButton(systemName: "minus", enabled: qty > 0) {
                Haptics.light()
                onChange(qty - 1)
            }
            Text("\(qty)")
                .textRole(.bodyStrong)
                .foregroundStyle(PyaasColor.onAccent)
                .frame(minWidth: 26)
                .contentTransition(.numericText())
                .animation(Motion.snappy, value: qty)
            stepButton(systemName: "plus", enabled: qty < max) {
                Haptics.light()
                onChange(qty + 1)
            }
        }
        .padding(.horizontal, 4)
        .frame(height: 36)
        .background(PyaasColor.roseDeep, in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Quantity")
        .accessibilityValue("\(qty)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment where qty < max: onChange(qty + 1)
            case .decrement where qty > 0: onChange(qty - 1)
            default: break
            }
        }
    }

    private func stepButton(systemName: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.footnote.weight(.bold))
                .foregroundStyle(PyaasColor.onAccent)
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}
