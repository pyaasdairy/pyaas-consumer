import SwiftUI

/// Account home: who you are, your membership, and the things you manage. OTP
/// login reuses the backend's email flow — no second auth. Owners (allowlisted
/// emails) also get an Admin entry.
struct AccountView: View {
    @Environment(AppModel.self) private var model
    @State private var showLogin = false
    @State private var showAdmin = false
    @State private var preview: AccountLink?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Space.xxl) {
                    if model.isSignedIn { profileHeader } else { signInCard }
                    if model.isAdmin { adminCard }
                    membershipCard
                    linksCard
                    if model.isSignedIn { signOutButton }
                    footer
                }
                .padding(.horizontal, Space.xl)
                .padding(.top, Space.sm)
            }
            .scrollIndicators(.hidden)
            .clearsTabBar()
            .background(PyaasColor.background.ignoresSafeArea())
            .navigationTitle("Account")
        }
        .sheet(isPresented: $showLogin) {
            OTPLoginView().environment(model)
        }
        .fullScreenCover(isPresented: $showAdmin) {
            AdminView().environment(model)
        }
        .sheet(item: $preview) { link in
            ComingSoonSheet(link: link)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }

    private var adminCard: some View {
        Button {
            Haptics.medium()
            showAdmin = true
        } label: {
            HStack(spacing: Space.lg) {
                ZStack {
                    Circle().fill(.white.opacity(0.2)).frame(width: 48, height: 48)
                    Image(systemName: "key.horizontal.fill").font(.headline).foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Owner console").textRole(.cardTitle).foregroundStyle(.white)
                    Text("Orders, live deliveries, and revenue at a glance.")
                        .textRole(.caption).foregroundStyle(.white.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.right").font(.body.weight(.bold)).foregroundStyle(.white)
            }
            .padding(Space.lg)
            .background(LinearGradient(colors: [PyaasColor.ink, PyaasColor.berry], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle.pyaas(Radius.card))
            .pyaasShadow(.card)
        }
        .buttonStyle(PressScale())
        .accessibilityLabel("Open owner console")
    }

    private var profileHeader: some View {
        Card {
            HStack(spacing: Space.lg) {
                ZStack {
                    Circle().fill(PyaasColor.brandGradient).frame(width: 60, height: 60)
                    Text(initials).textRole(.cardTitle).foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.profile.name).textRole(.displaySerif).foregroundStyle(PyaasColor.ink)
                    Text(model.profile.email ?? "PYAAS member").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                }
                Spacer()
            }
        }
    }

    private var initials: String {
        let parts = model.profile.name.split(separator: " ").prefix(2)
        return parts.map { String($0.prefix(1)) }.joined().uppercased()
    }

    private var signInCard: some View {
        Card {
            VStack(alignment: .leading, spacing: Space.lg) {
                HStack(spacing: Space.lg) {
                    ZStack {
                        Circle().fill(PyaasColor.roseSoft).frame(width: 56, height: 56)
                        Image(systemName: "person.crop.circle").font(.title).foregroundStyle(PyaasColor.roseDeep)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Sign in to PYAAS").textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                        Text("Save addresses, reorder in a tap, and track live.")
                            .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                PyaasButton("Continue with email", systemImage: "envelope.fill") { showLogin = true }
            }
        }
    }

    private var membershipCard: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            HStack {
                Image(systemName: "crown.fill").foregroundStyle(.white)
                Text("PYAAS VIP").textRole(.cardTitle).foregroundStyle(.white)
                Spacer()
                Text(model.profile.isVIP ? "Active" : "5-day free trial")
                    .textRole(.label).foregroundStyle(.white)
                    .padding(.horizontal, Space.md).padding(.vertical, 5)
                    .background(.white.opacity(0.22), in: Capsule())
            }
            Text("Free delivery, priority slots, and member pricing on every order.")
                .textRole(.caption).foregroundStyle(.white.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Space.lg)
        .background(PyaasColor.vipGradient, in: RoundedRectangle.pyaas(Radius.card))
        .pyaasShadow(.card)
    }

    private var linksCard: some View {
        Card(padding: Space.xs) {
            VStack(spacing: 0) {
                ForEach(Array(AccountLink.allCases.enumerated()), id: \.element) { index, link in
                    Button {
                        Haptics.selection()
                        preview = link
                    } label: { row(link) }
                        .buttonStyle(PressScale(scale: 0.99))
                    if index < AccountLink.allCases.count - 1 {
                        Divider().padding(.leading, 56)
                    }
                }
            }
        }
    }

    private func row(_ link: AccountLink) -> some View {
        HStack(spacing: Space.lg) {
            Image(systemName: link.icon).font(.headline).foregroundStyle(PyaasColor.roseDeep).frame(width: 28)
            Text(link.title).textRole(.body).foregroundStyle(PyaasColor.ink)
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(PyaasColor.inkMute)
        }
        .padding(.vertical, Space.md)
        .padding(.horizontal, Space.md)
        .contentShape(Rectangle())
    }

    private var signOutButton: some View {
        PyaasButton("Sign out", kind: .ghost) { model.signOut() }
    }

    private var footer: some View {
        VStack(spacing: Space.xs) {
            BrandLockup().opacity(0.5)
            Text("v1.0.0 · Made with care in Lucknow")
                .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
        }
        .padding(.top, Space.lg)
    }
}

enum AccountLink: String, CaseIterable, Identifiable {
    case subscriptions, addresses, wallet, passports, support, legal
    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .subscriptions: return "Subscriptions"
        case .addresses: return "Saved addresses"
        case .wallet: return "Wallet & payments"
        case .passports: return "Your milk passports"
        case .support: return "Help & support"
        case .legal: return "Legal & privacy"
        }
    }

    var icon: String {
        switch self {
        case .subscriptions: return "repeat"
        case .addresses: return "mappin.and.ellipse"
        case .wallet: return "wallet.bifold"
        case .passports: return "qrcode"
        case .support: return "questionmark.circle"
        case .legal: return "doc.text"
        }
    }

    var blurb: LocalizedStringKey {
        switch self {
        case .subscriptions: return "Daily or alternate-day milk, paused whenever you travel — landing soon."
        case .addresses: return "Pin your doorstep on the map and switch between home and work."
        case .wallet: return "Top up once, pay in a tap, and settle on delivery."
        case .passports: return "Every batch you’ve scanned, kept in one place."
        case .support: return "We’re a message away, every day before your delivery."
        case .legal: return "How we handle your data — minimally, and never sold."
        }
    }
}

/// Honest, branded placeholder for sections still being built.
struct ComingSoonSheet: View {
    let link: AccountLink

    var body: some View {
        VStack(spacing: Space.lg) {
            ZStack {
                Circle().fill(PyaasColor.roseSoft).frame(width: 72, height: 72)
                Image(systemName: link.icon).font(.system(size: 30, weight: .semibold)).foregroundStyle(PyaasColor.roseDeep)
            }
            Text(link.title).textRole(.displaySerif).foregroundStyle(PyaasColor.ink)
            Text(link.blurb).textRole(.body).foregroundStyle(PyaasColor.inkMute).multilineTextAlignment(.center)
            Pill(text: "COMING SOON", foreground: PyaasColor.berry, background: PyaasColor.roseSoft)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(Space.xxl)
        .background(PyaasColor.background)
    }
}
