import SwiftUI

/// The official PYAAS wordmark logo (`assets/pyaas-logo.png`), bundled as a
/// tintable template so it adapts to light, dark, and brand surfaces while
/// staying the one true mark. This replaces the earlier drawn drop+leaf.
struct BrandLogo: View {
    private let style: AnyShapeStyle
    private let height: CGFloat

    init(tint: AnyShapeStyle = AnyShapeStyle(PyaasColor.rose), height: CGFloat = 24) {
        self.style = tint
        self.height = height
    }

    init(color: Color, height: CGFloat = 24) {
        self.style = AnyShapeStyle(color)
        self.height = height
    }

    var body: some View {
        Image("pyaas-wordmark")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(height: height)
            .foregroundStyle(style)
            .accessibilityLabel("PYAAS")
    }
}

/// The wordmark *is* the logo. Kept as a named type so call sites read clearly.
struct Wordmark: View {
    var color: Color = PyaasColor.rose
    var size: Font.TextStyle = .title

    var body: some View { BrandLogo(color: color, height: Self.height(for: size)) }

    private static func height(for size: Font.TextStyle) -> CGFloat {
        switch size {
        case .largeTitle: return 38
        case .title: return 28
        case .title2: return 23
        case .title3: return 20
        default: return 18
        }
    }
}

/// The brand lockup is the official logo, pink by default.
struct BrandLockup: View {
    var tint: Color = PyaasColor.rose
    var height: CGFloat = 24

    var body: some View {
        BrandLogo(color: tint, height: height)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("PYAAS")
    }
}
