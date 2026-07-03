import SwiftUI

/// Motion tokens. Springs (not linear ease) for anything interactive; calm fades
/// for content. Always route choreography through here so Reduce Motion can swap
/// springs for fades in one place.
enum Motion {
    static let spring = Animation.spring(response: 0.42, dampingFraction: 0.86)
    static let snappy = Animation.spring(response: 0.30, dampingFraction: 0.82)
    static let gentle = Animation.spring(response: 0.58, dampingFraction: 0.90)
    static let fade = Animation.easeOut(duration: 0.25)

    /// Returns a calm fade when the user prefers reduced motion, otherwise the
    /// requested spring.
    static func adaptive(_ base: Animation, reduceMotion: Bool) -> Animation {
        reduceMotion ? fade : base
    }
}

/// A reusable, Reduce-Motion-aware entrance: content rises and fades in, or just
/// fades when motion is reduced. Used for staggered reveals down a screen.
struct AppearTransition: ViewModifier {
    var delay: Double = 0
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : (reduceMotion ? 0 : 14))
            .onAppear {
                withAnimation(Motion.adaptive(Motion.gentle, reduceMotion: reduceMotion).delay(delay)) {
                    shown = true
                }
            }
    }
}

extension View {
    /// Staggered rise-and-fade entrance. Pass an index-based delay for a cascade.
    func appear(delay: Double = 0) -> some View {
        modifier(AppearTransition(delay: delay))
    }
}
