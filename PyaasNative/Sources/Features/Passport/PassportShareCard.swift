import SwiftUI

/// A beautiful, self-contained card rendered to an image for sharing to
/// WhatsApp / Instagram. Editorial, branded, PII-minimal.
struct PassportShareCard: View {
    let passport: Passport

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                LinearGradient(colors: [PyaasColor.rose, PyaasColor.roseDeep, PyaasColor.berry],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                BrandLogo(color: .white.opacity(0.14), height: 30)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(Space.xl)

                VStack(alignment: .leading, spacing: Space.md) {
                    Wordmark(color: .white, size: .title2)
                    Text("MILK PASSPORT")
                        .font(PyaasFont.ui(.caption, .bold))
                        .tracking(3)
                        .foregroundStyle(.white.opacity(0.85))
                    Spacer()
                    Text("Traced to the farm")
                        .font(PyaasFont.serif(.title, .bold))
                        .foregroundStyle(.white)
                    if let farm = passport.leadFarm {
                        Text("Milked by \(farm.firstName)\(farm.village.map { " · \($0)" } ?? "")")
                            .font(PyaasFont.ui(.subheadline, .medium))
                            .foregroundStyle(.white.opacity(0.92))
                    }
                }
                .padding(Space.xxl)
            }
            .frame(height: 280)

            VStack(spacing: Space.lg) {
                HStack(spacing: Space.lg) {
                    shareStat("FAT", passport.fatPct.map { String(format: "%.1f%%", $0) } ?? "—")
                    divider
                    shareStat("SNF", passport.snfPct.map { String(format: "%.1f%%", $0) } ?? "—")
                    divider
                    shareStat("FRESH", passport.freshnessScore.map { "\(Int($0))%" } ?? "✓")
                }
                Text(passport.batchCode)
                    .font(PyaasFont.mono(.caption, .medium))
                    .foregroundStyle(PyaasColor.inkMute)
                Text("Every PYAAS pack carries its own story. pyaasdairy.com")
                    .font(PyaasFont.ui(.caption, .regular))
                    .foregroundStyle(PyaasColor.inkMute)
                    .multilineTextAlignment(.center)
            }
            .padding(Space.xxl)
        }
        .frame(width: 380)
        .background(PyaasColor.surface)
        .clipShape(RoundedRectangle.pyaas(Radius.sheet))
    }

    private func shareStat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value).font(PyaasFont.serif(.title2, .bold)).foregroundStyle(PyaasColor.ink)
            Text(label).font(PyaasFont.ui(.caption2, .semibold)).tracking(1).foregroundStyle(PyaasColor.inkMute)
        }
        .frame(maxWidth: .infinity)
    }

    private var divider: some View {
        Rectangle().fill(PyaasColor.hairline).frame(width: 1, height: 36)
    }
}
