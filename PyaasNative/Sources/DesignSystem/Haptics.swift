import UIKit

/// The haptics map. Generators are pre-prepared so the feedback lands on the
/// same frame as the visual. Light on selection, medium on add-to-cart and
/// scan-success, success/​warning/​error notifications on commits and failures.
/// Never spammed.
@MainActor
enum Haptics {
    private static let impactLight = UIImpactFeedbackGenerator(style: .light)
    private static let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private static let impactRigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let selectionGen = UISelectionFeedbackGenerator()
    private static let notify = UINotificationFeedbackGenerator()

    /// Warm up the engine ahead of a likely interaction (e.g. on screen appear).
    static func prepare() {
        impactLight.prepare()
        impactMedium.prepare()
        selectionGen.prepare()
        notify.prepare()
    }

    static func selection() {
        selectionGen.selectionChanged()
        selectionGen.prepare()
    }

    static func light() {
        impactLight.impactOccurred()
        impactLight.prepare()
    }

    static func medium() {
        impactMedium.impactOccurred()
        impactMedium.prepare()
    }

    /// A crisp tap used the instant a QR scan resolves.
    static func scanSuccess() {
        impactRigid.impactOccurred(intensity: 0.9)
        notify.notificationOccurred(.success)
    }

    static func success() {
        notify.notificationOccurred(.success)
        notify.prepare()
    }

    static func warning() {
        notify.notificationOccurred(.warning)
        notify.prepare()
    }

    static func error() {
        notify.notificationOccurred(.error)
        notify.prepare()
    }
}
