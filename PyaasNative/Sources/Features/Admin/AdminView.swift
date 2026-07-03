import SwiftUI

/// Owner-only operations panel. Opened from Account, but ONLY when the signed-in
/// email is on the `ADMIN_EMAILS` allowlist. This is a UI gate — the real
/// boundary is the database: an admin RLS policy on the allowlisted emails must
/// grant the cross-tenant read, or these queries return empty (see HANDOFF.md).
struct AdminView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model

    @State private var orders: [Order] = []
    @State private var phase: Phase = .loading

    private enum Phase { case loading, loaded, error }

    private var revenue: Money { orders.map(\.total).total() }
    private var liveCount: Int { orders.filter { $0.status.isLive }.count }
    private var deliveredCount: Int { orders.filter { $0.status == .delivered }.count }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading: loadingState
                case .error: ErrorState { Task { await load() } }
                case .loaded: content
                }
            }
            .background(PyaasColor.background.ignoresSafeArea())
            .navigationTitle("Admin")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(PyaasColor.roseDeep)
                }
            }
        }
        .task { await load() }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                signedInAs

                LazyVGrid(columns: [GridItem(.flexible(), spacing: Space.md), GridItem(.flexible(), spacing: Space.md)], spacing: Space.md) {
                    kpi("Total orders", "\(orders.count)", "tray.full", PyaasColor.roseDeep)
                    kpi("Live now", "\(liveCount)", "dot.radiowaves.left.and.right", PyaasColor.berry)
                    kpi("Delivered", "\(deliveredCount)", "checkmark.seal", PyaasColor.success)
                    kpi("Revenue", revenue.formatted, "indianrupeesign.circle", PyaasColor.gold)
                }

                SectionHeader(title: "Recent orders")
                if orders.isEmpty {
                    emptyNotice
                } else {
                    VStack(spacing: Space.md) {
                        ForEach(orders) { order in adminOrderRow(order) }
                    }
                }
            }
            .padding(.horizontal, Space.xl)
            .padding(.top, Space.sm)
            .padding(.bottom, Space.huge)
        }
        .scrollIndicators(.hidden)
    }

    private var signedInAs: some View {
        Card(elevation: .soft) {
            HStack(spacing: Space.md) {
                Image(systemName: "key.horizontal.fill").font(.headline).foregroundStyle(PyaasColor.gold)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Owner access").textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                    Text(model.profile.email ?? "—").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                }
                Spacer()
            }
        }
    }

    private func kpi(_ label: LocalizedStringKey, _ value: String, _ icon: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Image(systemName: icon).font(.headline).foregroundStyle(tint)
            Text(value).textRole(.cardTitle).foregroundStyle(PyaasColor.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.lg)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
        .pyaasShadow(.soft)
    }

    private func adminOrderRow(_ order: Order) -> some View {
        HStack(spacing: Space.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(order.code).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text(DateFormat.dayTime(order.placedAt)).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            Spacer()
            Pill(text: order.status.title.uppercased(),
                 foreground: order.status.isLive ? PyaasColor.berry : PyaasColor.inkSoft,
                 background: order.status.isLive ? PyaasColor.roseSoft : PyaasColor.wash)
            Text(order.total.formatted).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
        }
        .padding(Space.lg)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
    }

    private var emptyNotice: some View {
        Card(elevation: .soft) {
            VStack(alignment: .leading, spacing: Space.sm) {
                Label("No orders visible", systemImage: "lock.shield")
                    .textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text("You’re signed in as an owner, but the database hasn’t granted this email a cross-tenant admin read yet. Add the admin RLS policy (see HANDOFF.md) to see every order here.")
                    .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: Space.lg) {
            ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 72, radius: Radius.card) }
        }
        .padding(.horizontal, Space.xl)
        .padding(.top, Space.lg)
    }

    private func load() async {
        phase = .loading
        do {
            orders = try await model.orderService.allOrders()
            phase = .loaded
        } catch {
            phase = .error
        }
    }
}
