import SwiftUI
import UIKit

/// A thin wrapper over `UIActivityViewController` so we can share a rendered
/// passport card to WhatsApp / Instagram / Messages.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
