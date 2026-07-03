import SwiftUI

/// A loading shimmer that sweeps across skeleton shapes. Falls back to a static
/// tint when Reduce Motion is on.
private struct Shimmer: ViewModifier {
    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content
                .overlay(
                    GeometryReader { geo in
                        let width = geo.size.width
                        LinearGradient(
                            colors: [.clear, PyaasColor.onAccent.opacity(0.45), .clear],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .frame(width: width * 0.6)
                        .offset(x: phase * width * 1.6)
                        .blendMode(.plusLighter)
                    }
                )
                .mask(content)
                .onAppear {
                    withAnimation(.linear(duration: 1.25).repeatForever(autoreverses: false)) {
                        phase = 1
                    }
                }
        }
    }
}

extension View {
    func shimmering() -> some View { modifier(Shimmer()) }
}

/// A single skeleton block — matches the shape of the content it stands in for.
struct SkeletonBlock: View {
    var width: CGFloat? = nil
    var height: CGFloat = 14
    var radius: CGFloat = 7

    var body: some View {
        RoundedRectangle.pyaas(radius)
            .fill(PyaasColor.wash)
            .frame(width: width, height: height)
            .shimmering()
            .accessibilityHidden(true)
    }
}
