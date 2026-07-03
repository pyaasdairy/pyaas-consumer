import SwiftUI

enum AppTab: Int, CaseIterable, Identifiable {
    case home, shop, orders, account
    var id: Int { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .home: return "Home"
        case .shop: return "Shop"
        case .orders: return "Track"
        case .account: return "Account"
        }
    }

    var icon: String {
        switch self {
        case .home: return "drop"
        case .shop: return "bag"
        case .orders: return "location"
        case .account: return "person"
        }
    }

    var iconSelected: String {
        switch self {
        case .home: return "drop.fill"
        case .shop: return "bag.fill"
        case .orders: return "location.fill"
        case .account: return "person.fill"
        }
    }
}

/// A floating, intentional tab bar — a soft material pill with an animated
/// selection capsule that glides between tabs. Not the default `TabView` chrome.
struct PyaasTabBar: View {
    @Binding var selection: AppTab
    var cartCount: Int = 0
    @Namespace private var indicator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, Space.sm)
        .padding(.vertical, Space.sm)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(PyaasColor.hairline.opacity(0.6), lineWidth: 1))
        .pyaasShadow(.lifted)
        .padding(.horizontal, Space.huge)
    }

    private func tabButton(_ tab: AppTab) -> some View {
        let isSelected = selection == tab
        return Button {
            guard selection != tab else { return }
            Haptics.selection()
            withAnimation(Motion.adaptive(Motion.spring, reduceMotion: reduceMotion)) {
                selection = tab
            }
        } label: {
            VStack(spacing: 3) {
                ZStack {
                    Image(systemName: isSelected ? tab.iconSelected : tab.icon)
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(isSelected ? PyaasColor.onAccent : PyaasColor.inkMute)
                        .symbolEffect(.bounce, value: isSelected)
                        .overlay(alignment: .topTrailing) {
                            if tab == .shop, cartCount > 0 {
                                CountBadge(count: cartCount).offset(x: 10, y: -8)
                            }
                        }
                }
                .frame(width: 40, height: 32)
                .background {
                    if isSelected {
                        Capsule()
                            .fill(PyaasColor.brandGradient)
                            .matchedGeometryEffect(id: "tabIndicator", in: indicator)
                    }
                }

                Text(tab.title)
                    .textRole(.tab)
                    .foregroundStyle(isSelected ? PyaasColor.roseDeep : PyaasColor.inkMute)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScale(scale: 0.94))
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

/// Small count badge used for the cart.
struct CountBadge: View {
    let count: Int
    var body: some View {
        Text("\(min(count, 99))")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(PyaasColor.berry, in: Capsule())
            .overlay(Capsule().strokeBorder(.white, lineWidth: 1.5))
            .accessibilityLabel("\(count) in cart")
    }
}
