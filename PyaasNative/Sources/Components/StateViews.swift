import SwiftUI

/// Branded empty state — a soft mark, a warm line of copy, and at most one clear
/// action. Never a dead end.
struct EmptyState: View {
    var systemImage: String
    var title: LocalizedStringKey
    var message: LocalizedStringKey
    var ctaTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: Space.lg) {
            ZStack {
                Circle().fill(PyaasColor.roseSoft).frame(width: 88, height: 88)
                Image(systemName: systemImage)
                    .font(.system(size: 34, weight: .regular))
                    .foregroundStyle(PyaasColor.roseDeep)
            }
            VStack(spacing: Space.sm) {
                Text(title)
                    .textRole(.displaySerif)
                    .foregroundStyle(PyaasColor.ink)
                    .multilineTextAlignment(.center)
                Text(message)
                    .textRole(.body)
                    .foregroundStyle(PyaasColor.inkMute)
                    .multilineTextAlignment(.center)
            }
            if let ctaTitle, let action {
                PyaasButton(ctaTitle, kind: .secondary, fullWidth: false, action: action)
            }
        }
        .padding(Space.xxl)
        .frame(maxWidth: .infinity)
    }
}

/// Humane, branded error state with a single Retry. Never a raw error string.
struct ErrorState: View {
    var title: LocalizedStringKey = "Something went sideways"
    var message: LocalizedStringKey = "We couldn’t load this just now. Check your connection and try again."
    var retry: () -> Void

    var body: some View {
        VStack(spacing: Space.lg) {
            ZStack {
                Circle().fill(PyaasColor.dangerSoft).frame(width: 88, height: 88)
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 32, weight: .regular))
                    .foregroundStyle(PyaasColor.danger)
            }
            VStack(spacing: Space.sm) {
                Text(title)
                    .textRole(.cardTitle)
                    .foregroundStyle(PyaasColor.ink)
                    .multilineTextAlignment(.center)
                Text(message)
                    .textRole(.body)
                    .foregroundStyle(PyaasColor.inkMute)
                    .multilineTextAlignment(.center)
            }
            PyaasButton("Try again", systemImage: "arrow.clockwise", kind: .secondary, fullWidth: false, action: retry)
        }
        .padding(Space.xxl)
        .frame(maxWidth: .infinity)
    }
}
