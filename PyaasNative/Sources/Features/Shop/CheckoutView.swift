import SwiftUI

/// Checkout: address, slot, payment, and one clear primary action per step,
/// ending in a real "order placed" moment — haptic + motion, not a toast.
struct CheckoutView: View {
    @Binding var path: NavigationPath
    @Environment(AppModel.self) private var model

    @State private var slot: DeliverySlot = .morning
    @State private var payment: PaymentMethod = .cod
    @State private var isPlacing = false
    @State private var placed = false

    private let gateway: PaymentGateway = StubGateway()
    private var billing: Billing { Billing(cart: model.cart) }

    enum DeliverySlot: String, CaseIterable, Identifiable {
        case morning, day, evening
        var id: String { rawValue }
        var label: LocalizedStringKey {
            switch self {
            case .morning: return "6–8 AM"
            case .day: return "11 AM–1 PM"
            case .evening: return "6–8 PM"
            }
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    addressCard
                    slotPicker
                    paymentPicker
                    billSummary
                }
                .padding(.horizontal, Space.xl)
                .padding(.top, Space.lg)
                .padding(.bottom, 140)
            }
            .scrollIndicators(.hidden)

            placeBar
        }
        .background(PyaasColor.background.ignoresSafeArea())
        .navigationTitle("Checkout")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if placed { successOverlay } }
    }

    private var addressCard: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            SectionHeader(title: "Deliver to", actionTitle: "Change") {}
            Card(elevation: .soft) {
                HStack(spacing: Space.md) {
                    Image(systemName: "house.fill").font(.headline).foregroundStyle(PyaasColor.roseDeep).frame(width: 28)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Home").textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                        Text("Flat 4B, Eldeco Utopia, Sector B, Lucknow")
                            .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                    }
                    Spacer()
                }
            }
        }
    }

    private var slotPicker: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            SectionHeader(title: "Delivery slot")
            HStack(spacing: Space.sm) {
                ForEach(DeliverySlot.allCases) { option in
                    Chip(title: option.label, isSelected: slot == option) {
                        withAnimation(Motion.snappy) { slot = option }
                    }
                }
            }
        }
    }

    private var paymentPicker: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            SectionHeader(title: "Payment")
            VStack(spacing: Space.sm) {
                ForEach(PaymentMethod.allCases) { method in
                    paymentRow(method)
                }
            }
        }
    }

    private func paymentRow(_ method: PaymentMethod) -> some View {
        Button {
            Haptics.selection()
            withAnimation(Motion.snappy) { payment = method }
        } label: {
            HStack(spacing: Space.md) {
                Image(systemName: method.icon).font(.headline).foregroundStyle(PyaasColor.roseDeep).frame(width: 28)
                Text(method.title).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Spacer()
                Image(systemName: payment == method ? "largecircle.fill.circle" : "circle")
                    .font(.title3)
                    .foregroundStyle(payment == method ? PyaasColor.roseDeep : PyaasColor.hairline)
            }
            .padding(Space.lg)
            .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
            .overlay(
                RoundedRectangle.pyaas(Radius.card)
                    .strokeBorder(payment == method ? PyaasColor.roseDeep : PyaasColor.hairline.opacity(0.7),
                                  lineWidth: payment == method ? 1.5 : 1)
            )
        }
        .buttonStyle(PressScale())
        .accessibilityAddTraits(payment == method ? [.isButton, .isSelected] : .isButton)
    }

    private var billSummary: some View {
        Card {
            VStack(spacing: Space.md) {
                HStack {
                    Text("To pay").textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                    Spacer()
                    Text(billing.total.formatted).textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                }
                if billing.savings.paise > 0 {
                    HStack {
                        Image(systemName: "tag.fill").font(.caption).foregroundStyle(PyaasColor.berry)
                        Text("You’re saving \(billing.savings.formatted) on this order")
                            .textRole(.caption).foregroundStyle(PyaasColor.berry)
                        Spacer()
                    }
                }
            }
        }
    }

    private var placeBar: some View {
        PyaasButton(payment == .cod ? "Place order" : "Pay \(billing.total.formatted)",
                    systemImage: "checkmark", isLoading: isPlacing) {
            placeOrder()
        }
        .padding(.horizontal, Space.xl)
        .padding(.top, Space.md)
        .padding(.bottom, Space.xl)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }

    private func placeOrder() {
        guard !isPlacing else { return }
        isPlacing = true
        Task {
            do {
                try await gateway.pay(billing.total, method: payment)
                Haptics.success()
                withAnimation(Motion.spring) { placed = true }
            } catch {
                Haptics.error()
            }
            isPlacing = false
        }
    }

    private var successOverlay: some View {
        OrderPlacedView {
            model.cart.clear()
            path = NavigationPath()
        }
        .transition(.opacity)
    }
}

/// The order-placed celebration: a spring-in checkmark, warm copy, one action.
struct OrderPlacedView: View {
    let onDone: () -> Void
    @State private var pop = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            PyaasColor.background.ignoresSafeArea()
            VStack(spacing: Space.xl) {
                ZStack {
                    Circle().fill(PyaasColor.roseSoft).frame(width: 120, height: 120)
                    Image(systemName: "checkmark")
                        .font(.system(size: 50, weight: .bold))
                        .foregroundStyle(PyaasColor.roseDeep)
                        .scaleEffect(pop || reduceMotion ? 1 : 0.4)
                        .opacity(pop ? 1 : 0)
                }
                VStack(spacing: Space.sm) {
                    Text("Order placed")
                        .textRole(.heroSerif).foregroundStyle(PyaasColor.ink)
                    Text("We’ll start packing your milk fresh. You can watch it arrive live in Track.")
                        .textRole(.body).foregroundStyle(PyaasColor.inkMute)
                        .multilineTextAlignment(.center)
                }
                PyaasButton("Done", action: onDone)
                    .padding(.horizontal, Space.huge)
            }
            .padding(Space.xxl)
        }
        .onAppear {
            withAnimation(Motion.adaptive(.spring(response: 0.5, dampingFraction: 0.6), reduceMotion: reduceMotion)) {
                pop = true
            }
        }
    }
}
