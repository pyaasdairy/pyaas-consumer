import SwiftUI

/// The people behind the batch. PII-minimal by design: first name + village +
/// farm photo + story only — never contact, bank, or ID.
struct ContributingFarmsSection: View {
    let farms: [ContributingFarm]

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            SectionHeader(title: "Meet the farms", subtitle: farms.count > 1 ? "\(farms.count) farms poured into this batch" : "The farm behind your milk")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.lg) {
                    ForEach(farms) { farm in
                        FarmCard(farm: farm)
                    }
                }
                .padding(.horizontal, Space.xl)
            }
            .scrollClipDisabled()
            .padding(.horizontal, -Space.xl)
        }
    }
}

private struct FarmCard: View {
    let farm: ContributingFarm

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                Group {
                    if let url = farm.photoURL {
                        RemoteImage(url: url, maxPixel: 900)
                    } else {
                        ZStack(alignment: .topTrailing) {
                            LinearGradient(colors: [PyaasColor.rose, PyaasColor.berry],
                                           startPoint: .topLeading, endPoint: .bottomTrailing)
                            BrandLogo(color: .white.opacity(0.2), height: 16)
                                .padding(Space.md)
                        }
                    }
                }
                .frame(width: 260, height: 170)
                .clipped()

                LinearGradient(colors: [.clear, .black.opacity(0.45)], startPoint: .center, endPoint: .bottom)
                    .frame(width: 260, height: 170)

                VStack(alignment: .leading, spacing: 1) {
                    Text(farm.firstName)
                        .textRole(.displaySerif)
                        .foregroundStyle(.white)
                    if let village = farm.village {
                        Label(village, systemImage: "mappin.and.ellipse")
                            .textRole(.caption)
                            .foregroundStyle(.white.opacity(0.92))
                    }
                }
                .padding(Space.lg)
            }
            .frame(width: 260, height: 170)
            .clipShape(RoundedRectangle.pyaas(Radius.card))

            if let story = farm.story {
                Text("“\(story)”")
                    .textRole(.serifQuote)
                    .foregroundStyle(PyaasColor.inkSoft)
                    .lineLimit(4)
                    .padding(Space.lg)
            }
        }
        .frame(width: 260, alignment: .leading)
        .background(PyaasColor.surface, in: RoundedRectangle.pyaas(Radius.card))
        .overlay(RoundedRectangle.pyaas(Radius.card).strokeBorder(PyaasColor.hairline.opacity(0.7), lineWidth: 1))
        .pyaasShadow(.soft)
        .accessibilityElement(children: .combine)
    }
}
