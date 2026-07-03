import SwiftUI

/// The standard surface container. Depth comes from a soft shadow and a faint
/// hairline, not a hard box.
struct Card<Content: View>: View {
    var padding: CGFloat = Space.lg
    var radius: CGFloat = Radius.card
    var elevation: Elevation = .card
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PyaasColor.surface, in: RoundedRectangle.pyaas(radius))
            .overlay(
                RoundedRectangle.pyaas(radius)
                    .strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1)
            )
            .pyaasShadow(elevation)
    }
}

/// A small pill label (status, count, descriptor).
struct Pill: View {
    let text: String
    var foreground: Color = PyaasColor.roseDeep
    var background: Color = PyaasColor.roseSoft
    var systemImage: String?

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage).font(.caption2.weight(.bold))
            }
            Text(text).textRole(.label)
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, Space.md)
        .padding(.vertical, 5)
        .background(background, in: Capsule())
    }
}

/// A selectable chip used for categories / filters.
struct Chip: View {
    let title: LocalizedStringKey
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            Text(title)
                .textRole(.bodyStrong)
                .foregroundStyle(isSelected ? PyaasColor.onAccent : PyaasColor.inkSoft)
                .padding(.horizontal, Space.lg)
                .padding(.vertical, Space.sm)
                .background {
                    if isSelected {
                        Capsule().fill(PyaasColor.roseDeep)
                    } else {
                        Capsule().fill(PyaasColor.surface)
                        Capsule().strokeBorder(PyaasColor.hairline, lineWidth: 1)
                    }
                }
        }
        .buttonStyle(PressScale())
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
