import SwiftUI

/// The app frame: the selected tab's screen under a floating tab bar, with the
/// cinematic Passport presented as a full-screen overlay that zooms in from the
/// card you tapped — consistent across every entry point (featured card, recent
/// scan, or a fresh QR scan).
struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var selection: AppTab = .home
    @State private var heroPassport: Passport?
    @State private var detailPresented = false

    var body: some View {
        ZStack(alignment: .bottom) {
            PyaasColor.background.ignoresSafeArea()

            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            if heroPassport == nil && !detailPresented {
                PyaasTabBar(selection: $selection, cartCount: model.cart.itemCount)
                    .padding(.bottom, Space.xs)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            if let passport = heroPassport {
                PassportView(passport: passport) {
                    withAnimation(Motion.spring) { heroPassport = nil }
                }
                .zIndex(20)
                .transition(.scale(scale: 0.93).combined(with: .opacity))
            }
        }
        .onChange(of: selection) { _, _ in
            withAnimation(Motion.spring) { detailPresented = false }
        }
    }

    @ViewBuilder private var content: some View {
        switch selection {
        case .home:
            HomeView(onOpenPassport: open)
        case .shop:
            ShopView(tabBarHidden: $detailPresented)
        case .orders:
            OrdersView(tabBarHidden: $detailPresented)
        case .account:
            AccountView()
        }
    }

    private func open(_ passport: Passport) {
        Haptics.light()
        withAnimation(Motion.spring) { heroPassport = passport }
    }
}

/// Shared bottom inset so scrolling content clears the floating tab bar.
extension View {
    func clearsTabBar() -> some View {
        contentMargins(.bottom, 104, for: .scrollContent)
    }
}
