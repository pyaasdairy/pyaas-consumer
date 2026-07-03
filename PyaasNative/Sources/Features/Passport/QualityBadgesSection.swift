import SwiftUI

/// The four trust badges, with a tasteful "what this means" sheet on tap.
struct QualityBadgesSection: View {
    let quality: QualitySet
    @State private var explanation: Explanation?

    private struct Explanation: Identifiable {
        let id = UUID()
        let title: LocalizedStringKey
        let body: LocalizedStringKey
        let passed: Bool
        let icon: String
    }

    private let columns = [GridItem(.flexible(), spacing: Space.md), GridItem(.flexible(), spacing: Space.md)]

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            SectionHeader(title: "Proof, not promises", subtitle: "Independently checked, batch by batch")

            LazyVGrid(columns: columns, spacing: Space.md) {
                badge("Batch QA", "shield.lefthalf.filled", quality.batchQA,
                      body: "Every batch is sampled and graded before it’s allowed to be packed. This batch cleared that bar.")
                badge("Antibiotic-free", "cross.vial", quality.antibioticFree,
                      body: "We screen for antibiotic residue. Milk from any treated cow is held back, never bottled.")
                badge("No adulteration", "drop.triangle", quality.noAdulteration,
                      body: "Tested for added water, starch, detergent and other adulterants. This milk is exactly what it claims to be.")
                badge("Cold chain", "thermometer.snowflake", quality.coldChain,
                      body: "Chilled within the hour of milking and kept cold all the way to your door, so freshness never breaks.")
            }
        }
        .sheet(item: $explanation) { item in
            explanationSheet(item)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }

    private func badge(_ title: LocalizedStringKey, _ icon: String, _ passed: Bool, body: LocalizedStringKey) -> some View {
        QualityBadge(title: title, systemImage: icon, passed: passed) {
            explanation = Explanation(title: title, body: body, passed: passed, icon: icon)
        }
    }

    private func explanationSheet(_ item: Explanation) -> some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            ZStack {
                Circle().fill(item.passed ? PyaasColor.roseSoft : PyaasColor.dangerSoft).frame(width: 64, height: 64)
                Image(systemName: item.icon)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(item.passed ? PyaasColor.berry : PyaasColor.danger)
            }
            Text(item.title)
                .textRole(.displaySerif)
                .foregroundStyle(PyaasColor.ink)
            Text(item.body)
                .textRole(.body)
                .foregroundStyle(PyaasColor.inkSoft)
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.xxl)
        .background(PyaasColor.background)
    }
}
