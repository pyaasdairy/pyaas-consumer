import Foundation

// MARK: - Domain

/// The farm-to-bottle passport, the soul of the app. Assembled from whichever
/// live source resolved — a scanned QR token, the signed-in customer's latest
/// batch, or the authored sample. PII-minimal by design: first name + village +
/// farm photo + story only.
struct Passport: Identifiable, Sendable, Equatable, Codable {
    enum Source: Sendable, Equatable, Codable {
        case scanned(verified: Bool)
        case latest
        case sample
    }

    var id: String
    var batchCode: String
    var source: Source
    var productLine: String?

    var fatPct: Double?
    var snfPct: Double?
    var checksPassed: Int?
    var freshnessScore: Double?
    var temperatureC: Double?

    var collectedAt: Date?
    var packagedAt: Date?
    var deliveredAt: Date?

    var quality: QualitySet
    var contributingFarms: [ContributingFarm]

    /// The lead farm photo for the hero (first contributing farm with a photo).
    var heroPhotoURL: URL? { contributingFarms.first(where: { $0.photoURL != nil })?.photoURL }
    var leadFarm: ContributingFarm? { contributingFarms.first }

    var isVerified: Bool {
        if case .scanned(let verified) = source { return verified }
        return source == .latest
    }
}

struct QualitySet: Sendable, Equatable, Codable {
    var batchQA: Bool
    var antibioticFree: Bool
    var noAdulteration: Bool
    var coldChain: Bool

    var allPassed: Bool { batchQA && antibioticFree && noAdulteration && coldChain }
    var passedCount: Int { [batchQA, antibioticFree, noAdulteration, coldChain].filter { $0 }.count }
}

struct ContributingFarm: Identifiable, Sendable, Equatable, Codable {
    var id: String
    var firstName: String
    var village: String?
    var story: String?
    var photoURL: URL?
}

// MARK: - DTOs (decoded with convertFromSnakeCase)

/// Result of `get_milk_passport(p_token)` — anon-safe. Unknown tokens come back
/// as `{ "verified": false }`.
struct TokenPassportDTO: Decodable {
    var verified: Bool?
    var fatPct: Double?
    var snfPct: Double?
    var checksPassed: Int?
    var collectedAt: String?
    var packagedAt: String?
    var deliveredAt: String?
    var cluster: String?
    var centre: String?
    var report: ReportDTO?
}

struct ReportDTO: Decodable {
    var batchCode: String?
    var farmerName: String?
    var village: String?
    var freshnessScore: Double?
    var adulterationPass: Bool?
    var temperatureC: Double?
    var farmPhotoUrl: String?
    var story: String?
    var productLine: String?
}

/// Result of `my_milk_passport()` / a `traceability_samples` row.
struct MyPassportDTO: Decodable {
    var id: String?
    var batchCode: String?
    var productLine: String?
    var snf: Double?
    var fat: Double?
    var farmerName: String?
    var village: String?
    var collectionCentre: String?
    var collectionTime: String?
    var collectedAt: String?
    var packagedAt: String?
    var deliveredAt: String?
    var temperatureC: Double?
    var freshnessScore: Double?
    var adulterationPassed: Bool?
    var farmPhotoUrl: String?
}

// MARK: - Mapping

extension Passport {
    /// Build the four trust badges from the limited backend signals.
    /// Documented derivation (see docs/DECISIONS.md):
    ///   • No adulteration ← `adulteration_pass`
    ///   • Batch QA ← passed if any quality checks were recorded, else adulteration
    ///   • Antibiotic-free ← same lab battery as adulteration
    ///   • Cold chain ← temperature ≤ 6 °C when known, else assumed maintained
    static func quality(adulteration: Bool, checks: Int?, temperatureC: Double?) -> QualitySet {
        QualitySet(
            batchQA: (checks.map { $0 > 0 } ?? adulteration),
            antibioticFree: adulteration,
            noAdulteration: adulteration,
            coldChain: temperatureC.map { $0 <= 6.0 } ?? true
        )
    }

    static func from(token dto: TokenPassportDTO) -> Passport? {
        guard dto.verified == true else { return nil }
        let report = dto.report
        let adulteration = report?.adulterationPass ?? true
        let farm = ContributingFarm(
            id: report?.batchCode ?? UUID().uuidString,
            firstName: (report?.farmerName ?? "A PYAAS farmer").firstWord,
            village: report?.village ?? dto.cluster,
            story: report?.story,
            photoURL: report?.farmPhotoUrl.flatMap(URL.init(string:))
        )
        return Passport(
            id: report?.batchCode ?? UUID().uuidString,
            batchCode: report?.batchCode ?? "Scanned batch",
            source: .scanned(verified: true),
            productLine: report?.productLine,
            fatPct: dto.fatPct,
            snfPct: dto.snfPct,
            checksPassed: dto.checksPassed,
            freshnessScore: report?.freshnessScore,
            temperatureC: report?.temperatureC,
            collectedAt: ISODate.parse(dto.collectedAt),
            packagedAt: ISODate.parse(dto.packagedAt),
            deliveredAt: ISODate.parse(dto.deliveredAt),
            quality: quality(adulteration: adulteration, checks: dto.checksPassed, temperatureC: report?.temperatureC),
            contributingFarms: [farm]
        )
    }

    static func from(latest dto: MyPassportDTO) -> Passport? {
        guard let batch = dto.batchCode else { return nil }
        let adulteration = dto.adulterationPassed ?? true
        let farm = ContributingFarm(
            id: dto.id ?? batch,
            firstName: (dto.farmerName ?? "A PYAAS farmer").firstWord,
            village: dto.village,
            story: nil,
            photoURL: dto.farmPhotoUrl.flatMap(URL.init(string:))
        )
        return Passport(
            id: dto.id ?? batch,
            batchCode: batch,
            source: .latest,
            productLine: dto.productLine,
            fatPct: dto.fat,
            snfPct: dto.snf,
            checksPassed: nil,
            freshnessScore: dto.freshnessScore,
            temperatureC: dto.temperatureC,
            collectedAt: ISODate.parse(dto.collectedAt),
            packagedAt: ISODate.parse(dto.packagedAt),
            deliveredAt: ISODate.parse(dto.deliveredAt),
            quality: quality(adulteration: adulteration, checks: nil, temperatureC: dto.temperatureC),
            contributingFarms: [farm]
        )
    }
}

extension String {
    /// First name only — the PII allowlist shows first name + village + photo.
    var firstWord: String {
        split(separator: " ").first.map(String.init) ?? self
    }
}
