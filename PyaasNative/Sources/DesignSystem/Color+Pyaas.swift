import SwiftUI

/// The PYAAS palette as semantic, dark-mode-aware tokens. Every colour resolves
/// to an asset-catalog colorset with a light and dark variant, so no view ever
/// hardcodes a literal. Brand is pink + white; gold is reserved for VIP only.
enum PyaasColor {
    // Surfaces
    static let background = Color("Background")   // app canvas — pure white / near-black berry
    static let surface    = Color("Surface")      // cards
    static let surfaceAlt  = Color("SurfaceAlt")  // cream section fills
    static let wash       = Color("Wash")         // faint-pink image tiles / steppers
    static let hairline   = Color("Hairline")     // 1px separators

    // Ink
    static let ink     = Color("Ink")
    static let inkSoft = Color("InkSoft")
    static let inkMute = Color("InkMute")

    // Brand pink
    static let roseDeep = Color("RoseDeep")       // primary
    static let rose     = Color("Rose")
    static let roseSoft = Color("RoseSoft")        // tint surface for badges/chips
    static let berry    = Color("Berry")           // deeper secondary accent

    // VIP gold — sparingly, never a default CTA
    static let gold     = Color("Gold")
    static let goldDeep = Color("GoldDeep")
    static let goldSoft = Color("GoldSoft")

    // Semantic
    static let success    = Color("Success")
    static let danger     = Color("Danger")
    static let dangerSoft = Color("DangerSoft")
    static let warning    = Color("Warning")

    /// Text/icon colour that sits on a brand-pink or gold fill.
    static let onAccent = Color.white

    // Gradients
    static let brandGradient = LinearGradient(
        colors: [roseDeep, berry], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let brandGradientSoft = LinearGradient(
        colors: [rose, roseDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
    /// VIP membership only.
    static let vipGradient = LinearGradient(
        colors: [roseDeep, gold], startPoint: .leading, endPoint: .trailing)

    /// Translucent scrim for hero overlays so white headline text stays legible
    /// over a bright farm photo.
    static let heroScrim = LinearGradient(
        colors: [Color.black.opacity(0.0), Color.black.opacity(0.55)],
        startPoint: .top, endPoint: .bottom)
}
