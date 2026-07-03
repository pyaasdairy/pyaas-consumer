import SwiftUI

/// The vertical farm-to-bottle journey: Collected → Tested → Processed →
/// Delivered, with the real timestamps from the payload and a rail that reveals
/// on appear. Each row owns its rail segments, so dots and labels never drift.
struct FarmToBottleTimeline: View {
    let passport: Passport
    @State private var revealed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Stage: Identifiable {
        let id = UUID()
        let icon: String
        let title: LocalizedStringKey
        let detail: String
        let reached: Bool
    }

    private var stages: [Stage] {
        [
            Stage(icon: "drop.fill", title: "Collected at dawn",
                  detail: DateFormat.dayTime(passport.collectedAt), reached: passport.collectedAt != nil),
            Stage(icon: "checkmark.seal.fill", title: "Lab tested",
                  detail: passport.quality.noAdulteration
                    ? String(localized: "Passed every quality check")
                    : String(localized: "Flagged in testing"),
                  reached: true),
            Stage(icon: "shippingbox.fill", title: "Processed & packed",
                  detail: DateFormat.dayTime(passport.packagedAt), reached: passport.packagedAt != nil),
            Stage(icon: "house.fill", title: "Delivered to your door",
                  detail: DateFormat.dayTime(passport.deliveredAt), reached: passport.deliveredAt != nil),
        ]
    }

    private let dotSize: CGFloat = 38

    var body: some View {
        let reachedCount = stages.filter { $0.reached }.count
        return VStack(alignment: .leading, spacing: Space.lg) {
            SectionHeader(title: "Farm to bottle", subtitle: "Every step, time-stamped")
            VStack(spacing: 0) {
                ForEach(Array(stages.enumerated()), id: \.element.id) { index, stage in
                    row(index: index, stage: stage, isLast: index == stages.count - 1, reachedCount: reachedCount)
                }
            }
        }
        .onAppear {
            withAnimation(Motion.adaptive(.easeOut(duration: 0.7), reduceMotion: reduceMotion)) {
                revealed = true
            }
        }
    }

    private func row(index: Int, stage: Stage, isLast: Bool, reachedCount: Int) -> some View {
        let isActive = index < reachedCount
        let connectorActive = (index + 1) < reachedCount
        return HStack(alignment: .top, spacing: Space.lg) {
            VStack(spacing: 0) {
                Rectangle()
                    .fill(index == 0 ? Color.clear : (index < reachedCount ? PyaasColor.roseDeep : PyaasColor.hairline))
                    .frame(width: 3, height: 10)
                ZStack {
                    Circle()
                        .fill(isActive ? AnyShapeStyle(PyaasColor.brandGradient) : AnyShapeStyle(PyaasColor.wash))
                        .frame(width: dotSize, height: dotSize)
                    Image(systemName: stage.icon)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(isActive ? PyaasColor.onAccent : PyaasColor.inkMute)
                }
                .overlay(Circle().strokeBorder(PyaasColor.surface, lineWidth: 2))
                .scaleEffect(revealed ? 1 : 0.6)
                .opacity(revealed ? 1 : 0)
                .animation(Motion.spring.delay(Double(index) * 0.09), value: revealed)

                if !isLast {
                    Rectangle()
                        .fill(connectorActive ? PyaasColor.roseDeep : PyaasColor.hairline)
                        .frame(width: 3)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: dotSize)

            VStack(alignment: .leading, spacing: 2) {
                Text(stage.title)
                    .textRole(.bodyStrong)
                    .foregroundStyle(isActive ? PyaasColor.ink : PyaasColor.inkMute)
                Text(stage.detail)
                    .textRole(.caption)
                    .foregroundStyle(PyaasColor.inkMute)
            }
            .padding(.top, 8)
            .padding(.bottom, isLast ? 0 : Space.xl)
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}
