import SwiftUI

/// Branded launch splash: the drawn mark and wordmark settle in over a warm pink
/// gradient. Sets the tone before a single pixel of content loads.
struct SplashView: View {
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [PyaasColor.rose, PyaasColor.roseDeep, PyaasColor.berry],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: Space.lg) {
                BrandLogo(color: .white, height: 60)
                    .scaleEffect(appeared || reduceMotion ? 1 : 0.86)
                    .opacity(appeared ? 1 : 0)

                Text("Farm to bottle, traced.")
                    .textRole(.body)
                    .foregroundStyle(.white.opacity(0.9))
                    .opacity(appeared ? 1 : 0)
            }
        }
        .onAppear {
            withAnimation(Motion.adaptive(.spring(response: 0.6, dampingFraction: 0.78), reduceMotion: reduceMotion)) {
                appeared = true
            }
        }
    }
}
