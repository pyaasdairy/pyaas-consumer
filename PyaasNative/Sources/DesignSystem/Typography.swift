import SwiftUI

/// The type system. UI text is SF Pro; the consumer's editorial voice (passport
/// headlines, the farmer's pull-quote, composition numerals) is a warm serif —
/// New York, the system serif. Bundling Fraunces is a drop-in: add the TTFs to
/// Resources, list them in Info.plist `UIAppFonts`, and point `serif()` at it.
///
/// Everything maps to a Dynamic Type text style, so the whole app scales with
/// the user's preferred size — including at XXXL.
enum PyaasFont {
    static func serif(_ style: Font.TextStyle, _ weight: Font.Weight = .semibold) -> Font {
        .system(style, design: .serif).weight(weight)
    }
    static func ui(_ style: Font.TextStyle, _ weight: Font.Weight = .regular) -> Font {
        .system(style, design: .default).weight(weight)
    }
    static func mono(_ style: Font.TextStyle, _ weight: Font.Weight = .medium) -> Font {
        .system(style, design: .monospaced).weight(weight)
    }
}

/// Named text roles. Views set `.textRole(.sectionTitle)` rather than inlining a
/// font — there is exactly one definition of every role in the app.
enum TextRole {
    case heroSerif       // passport hero headline
    case displaySerif    // large section / screen titles in the editorial voice
    case serifQuote      // the farmer's story, italic
    case metricNumber    // composition numerals (fat / SNF / litres)
    case sectionTitle    // UI section headers
    case cardTitle
    case body
    case bodyStrong
    case label           // small uppercase-ish labels
    case caption
    case mono            // batch codes
    case button
    case tab
}

private struct PyaasTextStyle: ViewModifier {
    let role: TextRole

    func body(content: Content) -> some View {
        switch role {
        case .heroSerif:
            content.font(PyaasFont.serif(.largeTitle, .bold)).tracking(0.2).lineSpacing(2)
        case .displaySerif:
            content.font(PyaasFont.serif(.title, .bold)).tracking(0.2)
        case .serifQuote:
            content.font(PyaasFont.serif(.title3, .regular)).italic().lineSpacing(5)
        case .metricNumber:
            content.font(PyaasFont.serif(.title, .bold)).monospacedDigit()
        case .sectionTitle:
            content.font(PyaasFont.ui(.title3, .semibold)).tracking(0.1)
        case .cardTitle:
            content.font(PyaasFont.ui(.headline, .semibold))
        case .body:
            content.font(PyaasFont.ui(.subheadline, .regular)).lineSpacing(3)
        case .bodyStrong:
            content.font(PyaasFont.ui(.subheadline, .semibold))
        case .label:
            content.font(PyaasFont.ui(.footnote, .medium)).tracking(0.3)
        case .caption:
            content.font(PyaasFont.ui(.caption, .regular))
        case .mono:
            content.font(PyaasFont.mono(.footnote, .medium)).tracking(0.5)
        case .button:
            content.font(PyaasFont.ui(.headline, .semibold)).tracking(0.2)
        case .tab:
            content.font(PyaasFont.ui(.caption2, .medium))
        }
    }
}

extension View {
    func textRole(_ role: TextRole) -> some View {
        modifier(PyaasTextStyle(role: role))
    }
}
