import SwiftUI

/// Soft elevation only — never a hard 1px box. Two layered shadows give cards a
/// gentle lift the way iOS materials do.
enum Elevation {
    case soft     // resting chips / inputs
    case card     // standard cards
    case lifted   // sheets, floating bars, the sticky cart
}

private struct PyaasShadow: ViewModifier {
    let elevation: Elevation

    func body(content: Content) -> some View {
        switch elevation {
        case .soft:
            content
                .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
        case .card:
            content
                .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
                .shadow(color: .black.opacity(0.10), radius: 18, x: 0, y: 10)
        case .lifted:
            content
                .shadow(color: .black.opacity(0.06), radius: 3, x: 0, y: 1)
                .shadow(color: .black.opacity(0.14), radius: 26, x: 0, y: 14)
        }
    }
}

extension View {
    func pyaasShadow(_ elevation: Elevation = .card) -> some View {
        modifier(PyaasShadow(elevation: elevation))
    }
}
