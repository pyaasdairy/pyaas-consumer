import SwiftUI

/// THE hero. A cinematic, scrollable farm-to-bottle story that opens by expanding
/// the tapped card into a full-bleed farm hero (matched geometry), then reveals
/// the journey, the proof, and the people behind the milk.
struct PassportView: View {
    let passport: Passport
    var onClose: () -> Void

    @State private var shareImage: ShareableImage?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let heroHeight: CGFloat = 430

    var body: some View {
        ZStack(alignment: .top) {
            PyaasColor.background.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    hero
                    sheetContent
                }
            }
            .scrollIndicators(.hidden)
            .ignoresSafeArea(edges: .top)

            topBar
        }
        .sheet(item: $shareImage) { wrapper in
            ShareSheet(items: [wrapper.image])
                .presentationDetents([.medium, .large])
        }
        .transition(.opacity)
    }

    // MARK: Hero

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            heroBackground
                .frame(height: heroHeight)
                .frame(maxWidth: .infinity)
                .clipped()

            PyaasColor.heroScrim
                .frame(height: heroHeight)

            heroText
                .padding(Space.xl)
                .padding(.bottom, Space.sm)
        }
        .frame(height: heroHeight)
        .frame(maxWidth: .infinity)
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: Radius.sheet, bottomTrailingRadius: Radius.sheet, style: .continuous))
    }

    @ViewBuilder private var heroBackground: some View {
        if let url = passport.heroPhotoURL {
            RemoteImage(url: url, maxPixel: 1600)
                .parallax(height: heroHeight)
        } else {
            ZStack(alignment: .top) {
                LinearGradient(colors: [PyaasColor.rose, PyaasColor.roseDeep, PyaasColor.berry],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                RadialGradient(colors: [.white.opacity(0.28), .clear], center: .topTrailing, startRadius: 8, endRadius: 360)
                BrandLogo(color: .white.opacity(0.14), height: 26)
                    .padding(.top, 64)
                    .parallax(height: heroHeight)
            }
        }
    }

    private var heroText: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            sourcePill
            Text("Your milk, traced to the farm.")
                .textRole(.heroSerif)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .shadow(color: .black.opacity(0.25), radius: 12, y: 4)
            Text(passport.batchCode)
                .textRole(.mono)
                .foregroundStyle(.white)
                .padding(.horizontal, Space.md)
                .padding(.vertical, 6)
                .background(.white.opacity(0.18), in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.3), lineWidth: 1))
        }
    }

    private var sourcePill: some View {
        Group {
            switch passport.source {
            case .scanned(let verified):
                Pill(text: verified ? "VERIFIED" : "UNVERIFIED",
                     foreground: .white, background: .white.opacity(0.22),
                     systemImage: verified ? "checkmark.seal.fill" : "questionmark.seal")
            case .latest:
                Pill(text: "YOUR LATEST BATCH", foreground: .white, background: .white.opacity(0.22),
                     systemImage: "drop.fill")
            case .sample:
                Pill(text: "PREVIEW", foreground: .white, background: .white.opacity(0.22),
                     systemImage: "sparkles")
            }
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack {
            IconButton(systemName: "chevron.down", tint: PyaasColor.ink,
                       background: PyaasColor.surface, accessibilityLabel: "Close passport", action: onClose)
            Spacer()
            IconButton(systemName: "square.and.arrow.up", tint: PyaasColor.ink,
                       background: PyaasColor.surface, accessibilityLabel: "Share this passport", action: share)
        }
        .padding(.horizontal, Space.lg)
        .padding(.top, Space.sm)
    }

    // MARK: Sheet content

    private var sheetContent: some View {
        VStack(alignment: .leading, spacing: Space.xxxl) {
            farmerIntro.appear()
            composition.appear(delay: 0.05)
            FarmToBottleTimeline(passport: passport).appear(delay: 0.1)
            QualityBadgesSection(quality: passport.quality).appear(delay: 0.12)
            ContributingFarmsSection(farms: passport.contributingFarms).appear(delay: 0.14)
            shareCTA.appear(delay: 0.16)
            footer
        }
        .padding(.horizontal, Space.xl)
        .padding(.top, Space.xxl)
        .padding(.bottom, 120)
    }

    private var farmerIntro: some View {
        let farm = passport.leadFarm
        return Card {
            HStack(spacing: Space.lg) {
                ZStack {
                    Circle().fill(PyaasColor.brandGradient).frame(width: 60, height: 60)
                    if let url = farm?.photoURL {
                        RemoteImage(url: url, maxPixel: 200)
                            .frame(width: 60, height: 60).clipShape(Circle())
                    } else {
                        Image(systemName: "person.fill").font(.title2).foregroundStyle(.white)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Milked for you by")
                        .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
                    Text(farm?.firstName ?? "A PYAAS farmer")
                        .textRole(.displaySerif).foregroundStyle(PyaasColor.ink)
                    if let village = farm?.village {
                        Label(village, systemImage: "mappin.and.ellipse")
                            .textRole(.caption).foregroundStyle(PyaasColor.inkSoft)
                    }
                }
                Spacer()
            }
        }
    }

    private var composition: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            SectionHeader(title: "What’s inside", subtitle: "The measured composition of this batch")
            HStack(spacing: Space.md) {
                MetricTile(label: "Fat", value: passport.fatPct.map { String(format: "%.1f", $0) } ?? "—", unit: "%", icon: "drop.fill")
                MetricTile(label: "SNF", value: passport.snfPct.map { String(format: "%.1f", $0) } ?? "—", unit: "%", icon: "leaf.fill")
                MetricTile(label: "Freshness", value: passport.freshnessScore.map { "\(Int($0))" } ?? "✓", unit: passport.freshnessScore != nil ? "%" : "", icon: "sparkles")
            }
            if let temp = passport.temperatureC {
                Label("Delivered at \(String(format: "%.0f", temp))°C, cold chain intact", systemImage: "thermometer.snowflake")
                    .textRole(.caption)
                    .foregroundStyle(PyaasColor.inkSoft)
            }
        }
    }

    private var shareCTA: some View {
        VStack(spacing: Space.md) {
            PyaasButton("Share this story", systemImage: "square.and.arrow.up", kind: .secondary, action: share)
            Text("A beautiful card for WhatsApp or Instagram.")
                .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
        }
    }

    private var footer: some View {
        VStack(spacing: Space.sm) {
            BrandLockup()
                .opacity(0.55)
            Text("Traced from farm to bottle.")
                .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Space.lg)
    }

    // MARK: Share

    @MainActor private func share() {
        Haptics.light()
        let renderer = ImageRenderer(content: PassportShareCard(passport: passport))
        renderer.scale = 3
        if let image = renderer.uiImage {
            shareImage = ShareableImage(image: image)
        }
    }
}

/// Identifiable wrapper so a rendered image can drive a `.sheet(item:)`.
struct ShareableImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

/// A composition metric tile with refined serif numerals.
struct MetricTile: View {
    let label: LocalizedStringKey
    let value: String
    let unit: String
    let icon: String

    var body: some View {
        VStack(spacing: Space.sm) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(PyaasColor.roseDeep)
            HStack(alignment: .lastTextBaseline, spacing: 1) {
                Text(value).textRole(.metricNumber).foregroundStyle(PyaasColor.ink)
                Text(unit).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            Text(label).textRole(.caption).foregroundStyle(PyaasColor.inkMute)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Space.lg)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
        .pyaasShadow(.soft)
        .accessibilityElement(children: .combine)
    }
}

/// Subtle scroll-driven parallax/zoom kept inside a clipped hero frame, so it
/// never breaks layout.
private struct Parallax: ViewModifier {
    let height: CGFloat
    func body(content: Content) -> some View {
        content.visualEffect { view, proxy in
            let y = proxy.frame(in: .scrollView).minY
            return view
                .scaleEffect(1 + max(0, y) / (height * 1.4), anchor: .bottom)
                .offset(y: y < 0 ? -y * 0.28 : 0)
        }
    }
}

private extension View {
    func parallax(height: CGFloat) -> some View { modifier(Parallax(height: height)) }
}
