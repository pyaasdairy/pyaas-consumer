import SwiftUI

/// The single 8-pt spacing grid. Every padding, gap, and inset in the app comes
/// from here — consistency is the signal that a human laid it out.
enum Space {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
    static let xxxl: CGFloat = 32
    static let huge: CGFloat = 48
}

/// Corner radii. Always paired with `.continuous` corners (see `RoundedRectangle`
/// usage) so curves read as drawn, not stamped.
enum Radius {
    static let chip: CGFloat = 999
    static let control: CGFloat = 14
    static let image: CGFloat = 16
    static let card: CGFloat = 20
    static let sheet: CGFloat = 28
}

extension RoundedRectangle {
    /// A continuous-corner rounded rect at a design-system radius.
    static func pyaas(_ radius: CGFloat) -> RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }
}
