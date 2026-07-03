import SwiftUI

/// A consistent section header: a serif/UI title, optional subtitle, optional
/// trailing action. Gives every screen the same vertical rhythm.
struct SectionHeader: View {
    let title: LocalizedStringKey
    var subtitle: LocalizedStringKey?
    var actionTitle: LocalizedStringKey?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .textRole(.sectionTitle)
                    .foregroundStyle(PyaasColor.ink)
                if let subtitle {
                    Text(subtitle)
                        .textRole(.caption)
                        .foregroundStyle(PyaasColor.inkMute)
                }
            }
            Spacer(minLength: Space.md)
            if let actionTitle, let action {
                Button(action: {
                    Haptics.selection()
                    action()
                }) {
                    HStack(spacing: 2) {
                        Text(actionTitle).textRole(.bodyStrong)
                        Image(systemName: "chevron.right").font(.caption2.weight(.bold))
                    }
                    .foregroundStyle(PyaasColor.roseDeep)
                }
                .buttonStyle(PressScale())
            }
        }
    }
}
