import SwiftUI
import ImageIO
import UniformTypeIdentifiers

/// Thread-safe in-memory cache for decoded, downsampled images.
final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()
    private let cache = NSCache<NSURL, UIImage>()
    private init() { cache.countLimit = 120 }

    func image(for url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func set(_ image: UIImage, for url: URL) { cache.setObject(image, forKey: url as NSURL) }
}

/// Downsamples image data to a target pixel size using ImageIO, so we decode the
/// thumbnail — not the full-resolution bitmap — off the main thread. Keeps the
/// hero at 120fps even with large farm photos.
enum ImageDownsampler {
    static func downsample(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(64, maxPixel),
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// A progressive remote image: a soft wash placeholder shimmers, then the
/// decoded image fades in (blur-up). Falls back to a placeholder on failure.
struct RemoteImage<Placeholder: View>: View {
    let url: URL?
    var maxPixel: CGFloat = 1400
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var didFail = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            } else {
                placeholder()
            }
        }
        .task(id: url) { await load() }
    }

    private func load() async {
        image = nil
        didFail = false
        guard let url else { didFail = true; return }
        if let cached = ImageCache.shared.image(for: url) {
            image = cached
            return
        }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                didFail = true
                return
            }
            let target = maxPixel
            let decoded = await Task.detached(priority: .userInitiated) {
                ImageDownsampler.downsample(data, maxPixel: target)
            }.value
            guard let decoded else { didFail = true; return }
            ImageCache.shared.set(decoded, for: url)
            if reduceMotion {
                image = decoded
            } else {
                withAnimation(.easeOut(duration: 0.4)) { image = decoded }
            }
        } catch {
            didFail = true
        }
    }
}

extension RemoteImage where Placeholder == AnyView {
    /// Default placeholder: a faint-pink wash that shimmers while loading.
    init(url: URL?, maxPixel: CGFloat = 1400) {
        self.url = url
        self.maxPixel = maxPixel
        self.placeholder = { AnyView(PyaasColor.wash.shimmering()) }
    }
}
