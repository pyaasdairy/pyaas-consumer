import SwiftUI

/// A quality trust tile — Batch QA, Antibiotic-free, No adulteration, Cold chain.
/// Pass uses a brand tint + check; fail uses the danger tint. A tap reveals
/// "what this means" via `onInfo`.
struct QualityBadge: View {
    let title: LocalizedStringKey
    let systemImage: String
    let passed: Bool
    var onInfo: (() -> Void)?

    private var tint: Color { passed ? PyaasColor.berry : PyaasColor.danger }
    private var tintSoft: Color { passed ? PyaasColor.roseSoft : PyaasColor.dangerSoft }

    var body: some View {
        Button {
            Haptics.light()
            onInfo?()
        } label: {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack {
                    ZStack {
                        Circle().fill(tintSoft).frame(width: 40, height: 40)
                        Image(systemName: systemImage)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(tint)
                    }
                    Spacer()
                    Image(systemName: passed ? "checkmark.seal.fill" : "xmark.seal.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(tint)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .textRole(.bodyStrong)
                        .foregroundStyle(PyaasColor.ink)
                        .multilineTextAlignment(.leading)
                    Text(passed ? "Passed" : "Flagged")
                        .textRole(.caption)
                        .foregroundStyle(PyaasColor.inkMute)
                }
            }
            .padding(Space.lg)
            .frame(maxWidth: .infinity, minHeight: 124, alignment: .leading)
            .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
            .overlay(
                RoundedRectangle.pyaas(Radius.card)
                    .strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1)
            )
            .pyaasShadow(.soft)
        }
        .buttonStyle(PressScale())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(title))
        .accessibilityValue(passed ? Text("Passed") : Text("Flagged"))
        .accessibilityHint(onInfo == nil ? Text("") : Text("Double tap to learn what this means"))
    }
}
