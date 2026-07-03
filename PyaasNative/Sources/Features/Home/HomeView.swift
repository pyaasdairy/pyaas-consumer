import SwiftUI

/// A confident, content-first home: a warm greeting, a prominent scan
/// affordance, this week's milk passport (the matched-geometry source for the
/// cinematic open), recent scans, and a quiet trust strip.
struct HomeView: View {
    var onOpenPassport: (Passport) -> Void

    @Environment(AppModel.self) private var model
    @State private var featured: Passport?
    @State private var showScanner = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xxxl) {
                header
                scanCard
                featuredSection
                if !model.recentScans.isEmpty { recentSection }
                trustStrip
            }
            .padding(.horizontal, Space.xl)
            .padding(.top, Space.sm)
        }
        .scrollIndicators(.hidden)
        .clearsTabBar()
        .background(PyaasColor.background.ignoresSafeArea())
        .task {
            if featured == nil { featured = await model.featuredPassport() }
        }
        .fullScreenCover(isPresented: $showScanner) {
            ScanView(onPassport: onOpenPassport)
                .environment(model)
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(greeting)
                    .textRole(.caption)
                    .foregroundStyle(PyaasColor.inkMute)
                BrandLockup()
            }
            Spacer()
            IconButton(systemName: "qrcode.viewfinder", tint: PyaasColor.roseDeep,
                       background: PyaasColor.surface, accessibilityLabel: "Scan a pack") {
                showScanner = true
            }
        }
    }

    private var greeting: LocalizedStringKey {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        default: return "Good evening"
        }
    }

    // MARK: Scan card

    private var scanCard: some View {
        Button {
            showScanner = true
        } label: {
            HStack(spacing: Space.lg) {
                ZStack {
                    RoundedRectangle.pyaas(Radius.control).fill(.white.opacity(0.2)).frame(width: 56, height: 56)
                    Image(systemName: "qrcode.viewfinder").font(.system(size: 26, weight: .semibold)).foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("Scan your pack")
                        .textRole(.cardTitle).foregroundStyle(.white)
                    Text("Meet the farmers your milk came from.")
                        .textRole(.caption).foregroundStyle(.white.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.right").font(.body.weight(.bold)).foregroundStyle(.white)
            }
            .padding(Space.lg)
            .background(PyaasColor.brandGradient, in: RoundedRectangle.pyaas(Radius.card))
            .pyaasShadow(.card)
        }
        .buttonStyle(PressScale())
        .accessibilityLabel("Scan your pack")
        .accessibilityHint("Opens the camera to read a pack's QR code")
    }

    // MARK: Featured passport

    private var featuredSection: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            SectionHeader(title: "Your milk this week", subtitle: "Traced, tested, and on its way")
            if let featured {
                featuredCard(featured)
            } else {
                featuredSkeleton
            }
        }
    }

    private func featuredCard(_ passport: Passport) -> some View {
        Button {
            onOpenPassport(passport)
        } label: {
            ZStack(alignment: .bottomLeading) {
                Group {
                    if let url = passport.heroPhotoURL {
                        RemoteImage(url: url, maxPixel: 1000)
                    } else {
                        ZStack(alignment: .topTrailing) {
                            LinearGradient(colors: [PyaasColor.rose, PyaasColor.roseDeep, PyaasColor.berry],
                                           startPoint: .topLeading, endPoint: .bottomTrailing)
                            BrandLogo(color: .white.opacity(0.18), height: 22)
                                .padding(Space.lg)
                        }
                    }
                }
                .frame(height: 210)
                .frame(maxWidth: .infinity)
                .clipped()

                LinearGradient(colors: [.clear, .black.opacity(0.5)], startPoint: .center, endPoint: .bottom)

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 3) {
                        if let farm = passport.leadFarm {
                            Text("Milked by \(farm.firstName)")
                                .textRole(.displaySerif).foregroundStyle(.white)
                            if let village = farm.village {
                                Text(village).textRole(.caption).foregroundStyle(.white.opacity(0.9))
                            }
                        }
                    }
                    Spacer()
                    Text("View passport")
                        .textRole(.label)
                        .foregroundStyle(.white)
                        .padding(.horizontal, Space.md).padding(.vertical, 7)
                        .background(.white.opacity(0.2), in: Capsule())
                }
                .padding(Space.lg)
            }
            .frame(height: 210)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle.pyaas(Radius.card))
            .pyaasShadow(.card)
        }
        .buttonStyle(PressScale())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your milk this week, milked by \(passport.leadFarm?.firstName ?? "a PYAAS farmer"). Opens the full passport.")
    }

    private var featuredSkeleton: some View {
        RoundedRectangle.pyaas(Radius.card)
            .fill(PyaasColor.wash)
            .frame(height: 210)
            .shimmering()
            .accessibilityLabel("Loading your milk passport")
    }

    // MARK: Recent scans

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            SectionHeader(title: "Recent scans")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.lg) {
                    ForEach(model.recentScans) { passport in
                        recentCard(passport)
                    }
                }
                .padding(.horizontal, Space.xl)
            }
            .scrollClipDisabled()
            .padding(.horizontal, -Space.xl)
        }
    }

    private func recentCard(_ passport: Passport) -> some View {
        Button {
            onOpenPassport(passport)
        } label: {
            VStack(alignment: .leading, spacing: Space.sm) {
                ZStack {
                    LinearGradient(colors: [PyaasColor.rose, PyaasColor.berry], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "drop.fill").font(.title3).foregroundStyle(.white.opacity(0.9))
                }
                .frame(width: 150, height: 96)
                .clipShape(RoundedRectangle.pyaas(Radius.image))

                Text(passport.leadFarm?.firstName ?? "PYAAS")
                    .textRole(.bodyStrong).foregroundStyle(PyaasColor.ink)
                Text(DateFormat.relative(passport.deliveredAt))
                    .textRole(.caption).foregroundStyle(PyaasColor.inkMute)
            }
            .frame(width: 150, alignment: .leading)
        }
        .buttonStyle(PressScale())
        .accessibilityLabel("Passport from \(passport.leadFarm?.firstName ?? "a farmer")")
    }

    // MARK: Trust strip

    private var trustStrip: some View {
        Card(elevation: .soft) {
            HStack(spacing: Space.md) {
                trustItem("point.3.connected.trianglepath.dotted", "Traceable")
                Divider().frame(height: 36)
                trustItem("checkmark.seal.fill", "Lab-tested")
                Divider().frame(height: 36)
                trustItem("thermometer.snowflake", "Cold chain")
            }
        }
    }

    private func trustItem(_ icon: String, _ label: LocalizedStringKey) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.title3).foregroundStyle(PyaasColor.roseDeep)
            Text(label).textRole(.caption).foregroundStyle(PyaasColor.inkSoft)
        }
        .frame(maxWidth: .infinity)
    }
}
