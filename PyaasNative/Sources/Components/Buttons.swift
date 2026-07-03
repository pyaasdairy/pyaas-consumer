import SwiftUI

/// Press feedback shared by every tappable surface: a calm scale-down spring and
/// a light haptic. Respects Reduce Motion.
struct PressScale: ButtonStyle {
    var scale: CGFloat = 0.97
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? scale : 1))
            .animation(Motion.adaptive(Motion.snappy, reduceMotion: reduceMotion), value: configuration.isPressed)
    }
}

enum PyaasButtonKind {
    case primary       // brand pink fill — the one clear action per screen
    case secondary     // soft pink tint
    case ghost         // text + hairline, low emphasis
    case vip           // gold gradient — membership only
    case destructive
}

/// The one button in the app. One primary per screen; everything else is
/// secondary or ghost. Carries its own loading + disabled states and the right
/// haptic on commit.
struct PyaasButton: View {
    let title: String
    var systemImage: String?
    var kind: PyaasButtonKind = .primary
    var fullWidth: Bool = true
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    init(_ title: String,
         systemImage: String? = nil,
         kind: PyaasButtonKind = .primary,
         fullWidth: Bool = true,
         isLoading: Bool = false,
         isEnabled: Bool = true,
         action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.kind = kind
        self.fullWidth = fullWidth
        self.isLoading = isLoading
        self.isEnabled = isEnabled
        self.action = action
    }

    var body: some View {
        Button {
            guard isEnabled, !isLoading else { return }
            Haptics.medium()
            action()
        } label: {
            ZStack {
                label.opacity(isLoading ? 0 : 1)
                if isLoading {
                    ProgressView()
                        .tint(foreground)
                }
            }
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .padding(.vertical, 15)
            .padding(.horizontal, Space.xxl)
            .background(background)
            .clipShape(RoundedRectangle.pyaas(Radius.control))
            .overlay(borderOverlay)
        }
        .buttonStyle(PressScale())
        .disabled(!isEnabled || isLoading)
        .opacity(isEnabled ? 1 : 0.5)
        .accessibilityLabel(Text(title))
        .accessibilityAddTraits(.isButton)
    }

    private var label: some View {
        HStack(spacing: Space.sm) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.body.weight(.semibold))
            }
            Text(title).textRole(.button)
        }
        .foregroundStyle(foreground)
    }

    private var foreground: Color {
        switch kind {
        case .primary, .vip, .destructive: return PyaasColor.onAccent
        case .secondary: return PyaasColor.roseDeep
        case .ghost: return PyaasColor.ink
        }
    }

    @ViewBuilder private var background: some View {
        switch kind {
        case .primary: PyaasColor.brandGradient
        case .vip: PyaasColor.vipGradient
        case .destructive: PyaasColor.danger
        case .secondary: PyaasColor.roseSoft
        case .ghost: PyaasColor.surface
        }
    }

    @ViewBuilder private var borderOverlay: some View {
        if kind == .ghost {
            RoundedRectangle.pyaas(Radius.control)
                .strokeBorder(PyaasColor.hairline, lineWidth: 1)
        }
    }
}

/// A circular icon button (back, close, torch, share). 44pt min target.
struct IconButton: View {
    let systemName: String
    var tint: Color = PyaasColor.ink
    var background: Color = PyaasColor.surface
    var accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: systemName)
                .font(.body.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(background, in: Circle())
                .pyaasShadow(.soft)
        }
        .buttonStyle(PressScale(scale: 0.92))
        .accessibilityLabel(Text(accessibilityLabel))
    }
}
