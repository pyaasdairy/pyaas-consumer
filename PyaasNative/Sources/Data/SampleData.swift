import Foundation

/// A single authored passport used as a clearly-labelled `.sample` PREVIEW on
/// first run (no session, nothing scanned yet) so the flagship hero is never
/// empty. Any real scan or signed-in batch replaces it immediately. This is the
/// only fixture the live UI shows — orders and tracking are always real data.
enum SampleData {
    static var passport: Passport {
        let now = Date()
        return Passport(
            id: "PYAAS-LKO-SAMPLE-M-001",
            batchCode: "PYAAS-LKO-20260614-M-001",
            source: .sample,
            productLine: "A2 Cow Milk",
            fatPct: 4.1,
            snfPct: 8.7,
            checksPassed: 6,
            freshnessScore: 98,
            temperatureC: 4.0,
            collectedAt: now.addingTimeInterval(-16 * 3600),
            packagedAt: now.addingTimeInterval(-11 * 3600),
            deliveredAt: now.addingTimeInterval(-2 * 3600),
            quality: QualitySet(batchQA: true, antibioticFree: true, noAdulteration: true, coldChain: true),
            contributingFarms: [
                ContributingFarm(
                    id: "f1", firstName: "Ramprasad", village: "Mohanlalganj",
                    story: "My family has kept Sahiwal cows for three generations. Every morning before the city wakes, we milk by hand and cool it within the hour. PYAAS lets me send that same milk, honest and untouched, to your door.",
                    photoURL: nil),
                ContributingFarm(
                    id: "f2", firstName: "Sunita", village: "Gosainganj",
                    story: "We feed our cows only what we grow ourselves. No shortcuts, no chemicals.",
                    photoURL: nil),
                ContributingFarm(
                    id: "f3", firstName: "Imran", village: "Bakshi Ka Talab",
                    story: "Forty cows, named and known. The herd is healthier when it's small.",
                    photoURL: nil),
            ]
        )
    }

}
