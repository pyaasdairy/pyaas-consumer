import SwiftUI
import MapKit

/// Uber-energy live tracking: the map is the canvas, a draggable bottom sheet is
/// the controller, and the status state machine drives one clear message per
/// state. The sample order's rider gently advances so the experience is alive.
struct OrderTrackingView: View {
    @State private var order: Order
    @State private var sheetExpanded = true
    @State private var dragTranslation: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(order: Order) { _order = State(initialValue: order) }

    private let collapsedHeight: CGFloat = 188
    private let expandedHeight: CGFloat = 444

    var body: some View {
        ZStack(alignment: .bottom) {
            map
                .ignoresSafeArea()

            sheet
        }
        .navigationTitle(order.code)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await simulate() }
    }

    // MARK: Map

    private var map: some View {
        Map(initialPosition: .region(region)) {
            if let dest = order.destination {
                Annotation(String(localized: "Home"), coordinate: dest) {
                    mapPin(systemName: "house.fill", fill: PyaasColor.berry)
                }
            }
            if let coord = order.rider?.coordinate {
                Annotation(order.rider?.name ?? String(localized: "Rider"), coordinate: coord) {
                    mapPin(systemName: "bicycle", fill: PyaasColor.roseDeep)
                        .accessibilityLabel("Your rider")
                }
                if let dest = order.destination {
                    MapPolyline(coordinates: [coord, dest])
                        .stroke(PyaasColor.roseDeep.opacity(0.6), style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [2, 8]))
                }
            }
        }
        .mapStyle(.standard(elevation: .flat))
        .tint(PyaasColor.roseDeep)
    }

    private func mapPin(systemName: String, fill: Color) -> some View {
        Image(systemName: systemName)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(fill, in: Circle())
            .overlay(Circle().strokeBorder(.white, lineWidth: 3))
            .pyaasShadow(.card)
    }

    private var region: MKCoordinateRegion {
        let center = order.destination ?? CLLocationCoordinate2D(latitude: 26.8467, longitude: 80.9462)
        return MKCoordinateRegion(center: center,
                                  span: MKCoordinateSpan(latitudeDelta: 0.03, longitudeDelta: 0.03))
    }

    // MARK: Bottom sheet

    private var sheet: some View {
        let height = (sheetExpanded ? expandedHeight : collapsedHeight) - dragTranslation
        return VStack(spacing: 0) {
            grabber
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    statusHeader
                    StatusTimeline(status: order.status)
                    if order.status == .outForDelivery, let rider = order.rider {
                        riderCard(rider)
                    }
                    if let batch = order.batchCode {
                        batchRow(batch)
                    }
                }
                .padding(.horizontal, Space.xl)
                .padding(.bottom, Space.xxl)
            }
            .scrollIndicators(.hidden)
            .scrollDisabled(!sheetExpanded)
        }
        .frame(height: max(collapsedHeight, min(expandedHeight, height)), alignment: .top)
        .frame(maxWidth: .infinity)
        .background(PyaasColor.surface)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: Radius.sheet, topTrailingRadius: Radius.sheet, style: .continuous))
        .pyaasShadow(.lifted)
        .gesture(dragGesture)
    }

    private var grabber: some View {
        Capsule()
            .fill(PyaasColor.hairline)
            .frame(width: 40, height: 5)
            .padding(.vertical, Space.md)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .accessibilityLabel(sheetExpanded ? "Collapse details" : "Expand details")
            .accessibilityAddTraits(.isButton)
            .onTapGesture { withAnimation(Motion.spring) { sheetExpanded.toggle() } }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                dragTranslation = sheetExpanded ? -value.translation.height : -value.translation.height
                dragTranslation = max(-120, min(120, dragTranslation))
            }
            .onEnded { value in
                withAnimation(Motion.spring) {
                    if value.translation.height < -40 { sheetExpanded = true }
                    else if value.translation.height > 40 { sheetExpanded = false }
                    dragTranslation = 0
                }
            }
    }

    private var statusHeader: some View {
        HStack(spacing: Space.lg) {
            ZStack {
                Circle().fill(PyaasColor.roseSoft).frame(width: 52, height: 52)
                Image(systemName: order.status.systemImage).font(.title3).foregroundStyle(PyaasColor.roseDeep)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(order.status.title).textRole(.cardTitle).foregroundStyle(PyaasColor.ink)
                Text(order.status.subtitle).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            Spacer()
            if let eta = order.etaMinutes, order.status.isLive {
                VStack(spacing: 0) {
                    Text("\(eta)").textRole(.displaySerif).foregroundStyle(PyaasColor.roseDeep)
                    Text("min").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                }
            }
        }
        .padding(.top, Space.xs)
    }

    private func riderCard(_ rider: Rider) -> some View {
        HStack(spacing: Space.lg) {
            ZStack {
                Circle().fill(PyaasColor.brandGradient).frame(width: 48, height: 48)
                Image(systemName: "person.fill").font(.headline).foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(rider.name).textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                HStack(spacing: 4) {
                    if let rating = rider.rating {
                        Image(systemName: "star.fill").font(.caption2).foregroundStyle(PyaasColor.gold)
                        Text(String(format: "%.1f", rating)).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                    }
                    if let vehicle = rider.vehicle {
                        Text("· \(vehicle)").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                    }
                }
            }
            Spacer()
            IconButton(systemName: "phone.fill", tint: PyaasColor.roseDeep, background: PyaasColor.roseSoft,
                       accessibilityLabel: "Call rider") {}
            IconButton(systemName: "message.fill", tint: PyaasColor.roseDeep, background: PyaasColor.roseSoft,
                       accessibilityLabel: "Message rider") {}
        }
        .padding(Space.lg)
        .background(PyaasColor.surfaceAlt, in: RoundedRectangle.pyaas(Radius.card))
    }

    private func batchRow(_ batch: String) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: "qrcode").font(.headline).foregroundStyle(PyaasColor.roseDeep)
            VStack(alignment: .leading, spacing: 1) {
                Text("Batch \(batch)").textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text("This milk's passport is ready to view.").textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            Spacer()
        }
        .padding(Space.lg)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
    }

    // MARK: Simulation

    private func simulate() async {
        guard order.status == .outForDelivery,
              order.destination != nil, order.rider?.coordinate != nil else { return }
        for _ in 0..<20 {
            try? await Task.sleep(for: .seconds(3))
            guard let dest = order.destination, let current = order.rider?.coordinate else { break }
            let lat = current.latitude + (dest.latitude - current.latitude) * 0.18
            let lng = current.longitude + (dest.longitude - current.longitude) * 0.18
            withAnimation(.easeInOut(duration: 1.2)) {
                order.rider?.coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
                if let eta = order.etaMinutes, eta > 1 { order.etaMinutes = eta - 1 }
            }
            let remaining = abs(dest.latitude - lat) + abs(dest.longitude - lng)
            if remaining < 0.0006 { break }
        }
    }
}

/// A compact horizontal status timeline that fills to the current state.
struct StatusTimeline: View {
    let status: OrderStatus

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(OrderStatus.flow.enumerated()), id: \.element) { index, step in
                let reached = step.flowIndex <= status.flowIndex
                Circle()
                    .fill(reached ? AnyShapeStyle(PyaasColor.brandGradient) : AnyShapeStyle(PyaasColor.hairline))
                    .frame(width: 12, height: 12)
                    .overlay {
                        if step == status {
                            Circle().strokeBorder(PyaasColor.roseDeep.opacity(0.3), lineWidth: 5).frame(width: 22, height: 22)
                        }
                    }
                if index < OrderStatus.flow.count - 1 {
                    Rectangle()
                        .fill(step.flowIndex < status.flowIndex ? PyaasColor.roseDeep : PyaasColor.hairline)
                        .frame(height: 3)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.vertical, Space.sm)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Order status: \(status.title)")
    }
}
