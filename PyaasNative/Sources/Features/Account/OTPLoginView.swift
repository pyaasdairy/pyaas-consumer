import SwiftUI

/// Email-OTP sign-in, reusing the backend's GoTrue flow (no second auth). A pink
/// gradient header over a white sheet — the same family as the field-ops app.
/// Requires "Confirm email" / email OTP enabled in Supabase Auth.
struct OTPLoginView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model

    @State private var email = ""
    @State private var code = ""
    @State private var step: Step = .email
    @State private var isWorking = false
    @State private var errorText: String?
    @FocusState private var focused: Bool

    private enum Step { case email, code }

    private var emailIsValid: Bool {
        email.contains("@") && email.contains(".") && !email.hasSuffix("@")
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            sheet
        }
        .background(PyaasColor.background.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [PyaasColor.rose, PyaasColor.roseDeep, PyaasColor.berry],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            BrandLogo(color: .white.opacity(0.16), height: 22)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(Space.xl)
            VStack(alignment: .leading, spacing: Space.sm) {
                Wordmark(color: .white, size: .title)
                Text(step == .email ? "Sign in to track your milk." : "Enter the 6-digit code we emailed you.")
                    .textRole(.body).foregroundStyle(.white.opacity(0.92))
            }
            .padding(Space.xl)
        }
        .frame(height: 200)
    }

    private var sheet: some View {
        VStack(alignment: .leading, spacing: Space.xl) {
            switch step {
            case .email: emailStep
            case .code: codeStep
            }
            if let errorText {
                Label(errorText, systemImage: "exclamationmark.circle.fill")
                    .textRole(.caption).foregroundStyle(PyaasColor.danger)
            }
            Spacer()
        }
        .padding(Space.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            field {
                Image(systemName: "envelope.fill").foregroundStyle(PyaasColor.inkMute)
                TextField("Email address", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .textRole(.body)
            }
            PyaasButton("Send code", systemImage: "arrow.right", isLoading: isWorking,
                        isEnabled: emailIsValid) {
                Task { await sendCode() }
            }
            Text("We’ll email you a one-time 6-digit code.")
                .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
        }
        .onAppear { focused = true }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            field {
                Image(systemName: "lock.fill").foregroundStyle(PyaasColor.inkMute)
                TextField("6-digit code", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($focused)
                    .textRole(.body)
            }
            PyaasButton("Verify & continue", systemImage: "checkmark", isLoading: isWorking,
                        isEnabled: code.filter(\.isNumber).count >= 4) {
                Task { await verify() }
            }
            Button {
                step = .email
                code = ""
                errorText = nil
            } label: {
                Text("Change email").textRole(.bodyStrong).foregroundStyle(PyaasColor.roseDeep)
            }
        }
        .onAppear { focused = true }
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        HStack(spacing: Space.md, content: content)
            .padding(Space.lg)
            .background(PyaasColor.surfaceAlt, in: RoundedRectangle.pyaas(Radius.control))
            .overlay(RoundedRectangle.pyaas(Radius.control).strokeBorder(PyaasColor.hairline, lineWidth: 1))
    }

    private var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func sendCode() async {
        guard !isWorking else { return }
        isWorking = true
        errorText = nil
        do {
            try await SupabaseClient.shared.requestEmailOTP(email: normalizedEmail)
            withAnimation(Motion.spring) { step = .code }
        } catch {
            errorText = (error as? APIError)?.userText ?? String(localized: "We couldn’t send a code right now.")
        }
        isWorking = false
    }

    private func verify() async {
        guard !isWorking else { return }
        isWorking = true
        errorText = nil
        do {
            try await SupabaseClient.shared.verifyEmailOTP(email: normalizedEmail, code: code.filter(\.isNumber))
            await model.refreshSession()
            Haptics.success()
            dismiss()
        } catch {
            Haptics.error()
            errorText = (error as? APIError)?.userText ?? String(localized: "That code didn’t match.")
        }
        isWorking = false
    }
}
