import SwiftUI

/// The orders home: a live order surfaced up top (tap to track), with past
/// orders below for one-tap reorder of a known-good batch.
struct OrdersView: View {
    @Binding var tabBarHidden: Bool
    @Environment(AppModel.self) private var model
    @State private var orders: [Order] = []
    @State private var loading = true
    @State private var path = NavigationPath()

    private var liveOrders: [Order] { orders.filter { $0.status.isLive } }
    private var pastOrders: [Order] { orders.filter { $0.status.isTerminal } }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if loading {
                    loadingState
                } else if !model.isSignedIn {
                    EmptyState(systemImage: "person.crop.circle",
                               title: "Sign in to track orders",
                               message: "Sign in from the Account tab to place orders and watch them arrive live.")
                } else if orders.isEmpty {
                    EmptyState(systemImage: "shippingbox",
                               title: "No orders yet",
                               message: "When you order, you’ll watch it travel from our chiller to your door, live.")
                } else {
                    content
                }
            }
            .background(PyaasColor.background.ignoresSafeArea())
            .navigationTitle("Track")
            .onChange(of: path.count) { _, depth in
                withAnimation(Motion.spring) { tabBarHidden = depth > 0 }
            }
            .onAppear { tabBarHidden = path.count > 0 }
            .navigationDestination(for: Order.self) { OrderTrackingView(order: $0) }
        }
        .task { await load() }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xxl) {
                if !liveOrders.isEmpty {
                    VStack(alignment: .leading, spacing: Space.lg) {
                        SectionHeader(title: "On its way")
                        ForEach(liveOrders) { order in
                            NavigationLink(value: order) { LiveOrderCard(order: order) }
                                .buttonStyle(PressScale())
                        }
                    }
                }
                if !pastOrders.isEmpty {
                    VStack(alignment: .leading, spacing: Space.lg) {
                        SectionHeader(title: "Past orders")
                        ForEach(pastOrders) { order in
                            NavigationLink(value: order) { PastOrderRow(order: order) }
                                .buttonStyle(PressScale())
                        }
                    }
                }
            }
            .padding(.horizontal, Space.xl)
            .padding(.top, Space.sm)
        }
        .scrollIndicators(.hidden)
        .clearsTabBar()
    }

    private var loadingState: some View {
        VStack(spacing: Space.lg) {
            ForEach(0..<3, id: \.self) { _ in
                SkeletonBlock(height: 96, radius: Radius.card)
            }
        }
        .padding(.horizontal, Space.xl)
        .padding(.top, Space.sm)
    }

    private func load() async {
        if model.isSignedIn {
            orders = (try? await model.orderService.myOrders()) ?? []
        } else {
            orders = []
        }
        withAnimation(Motion.fade) { loading = false }
    }
}

private struct LiveOrderCard: View {
    let order: Order

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            HStack {
                Pill(text: "LIVE", foreground: .white, background: PyaasColor.berry, systemImage: "dot.radiowaves.left.and.right")
                Spacer()
                if let eta = order.etaMinutes {
                    Text("ETA \(eta) min").textRole(.bodyStrong).foregroundStyle(PyaasColor.roseDeep)
                }
            }
            HStack(spacing: Space.lg) {
                ZStack {
                    Circle().fill(PyaasColor.roseSoft).frame(width: 48, height: 48)
                    Image(systemName: order.status.systemImage).font(.headline).foregroundStyle(PyaasColor.roseDeep)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(order.status.title).textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                    Text(order.status.subtitle).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.subheadline.weight(.bold)).foregroundStyle(PyaasColor.inkMute)
            }
            Text("\(order.code) · \(order.itemSummary)").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
        }
        .padding(Space.lg)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.roseSoft, lineWidth: 1.5))
        .pyaasShadow(.card)
    }
}

private struct PastOrderRow: View {
    let order: Order

    var body: some View {
        HStack(spacing: Space.lg) {
            ZStack {
                Circle().fill(PyaasColor.wash).frame(width: 44, height: 44)
                Image(systemName: "checkmark").font(.subheadline.weight(.bold)).foregroundStyle(PyaasColor.berry)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(order.itemSummary).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink).lineLimit(1)
                Text("\(order.code) · \(DateFormat.relative(order.placedAt))").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            Spacer()
            Text(order.total.formatted).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
        }
        .padding(Space.lg)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
        .pyaasShadow(.soft)
    }
}
