import SwiftUI
import AVFoundation

/// The scan experience: a live camera with a custom reticle (not a stock scanner
/// sheet), a torch, and a calm "reading your pack" resolve state. Hands a
/// verified passport back to the caller.
struct ScanView: View {
    var onPassport: (Passport) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var permission: Permission = .undetermined
    @State private var torchOn = false
    @State private var phase: Phase = .scanning
    @State private var failMessage = ""
    @State private var scanID = UUID()
    @State private var sweep = false

    private enum Permission { case undetermined, authorized, denied }
    private enum Phase { case scanning, resolving, failed }

    private let reticle: CGFloat = 264

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch permission {
            case .authorized: camera
            case .denied: deniedState
            case .undetermined: Color.black
            }

            chrome
        }
        .task { await requestPermission() }
    }

    // MARK: Camera + reticle

    private var camera: some View {
        ZStack {
            QRScanner(isTorchOn: torchOn, onFound: handleFound)
                .id(scanID)
                .ignoresSafeArea()

            // Dimmed surround with a punched-out reticle
            ZStack {
                Color.black.opacity(0.5)
                RoundedRectangle.pyaas(28)
                    .frame(width: reticle, height: reticle)
                    .blendMode(.destinationOut)
            }
            .compositingGroup()
            .ignoresSafeArea()

            reticleFrame

            VStack {
                Spacer()
                hintCard
                    .padding(.horizontal, Space.xl)
                    .padding(.bottom, Space.huge)
            }

            if phase == .resolving { resolvingOverlay }
            if phase == .failed { failOverlay }
        }
    }

    private var reticleFrame: some View {
        ZStack {
            ForEach(0..<4) { corner in
                ReticleCorner()
                    .stroke(PyaasColor.roseDeep, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 36, height: 36)
                    .rotationEffect(.degrees(Double(corner) * 90))
                    .offset(cornerOffset(corner))
            }
            if !reduceMotion {
                RoundedRectangle.pyaas(2)
                    .fill(LinearGradient(colors: [.clear, PyaasColor.rose, .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(width: reticle - 28, height: 3)
                    .offset(y: sweep ? (reticle / 2 - 18) : -(reticle / 2 - 18))
                    .onAppear {
                        withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { sweep = true }
                    }
            }
        }
        .frame(width: reticle, height: reticle)
    }

    private func cornerOffset(_ corner: Int) -> CGSize {
        let d = reticle / 2 - 18
        switch corner {
        case 0: return CGSize(width: -d, height: -d)
        case 1: return CGSize(width: d, height: -d)
        case 2: return CGSize(width: d, height: d)
        default: return CGSize(width: -d, height: d)
        }
    }

    private var hintCard: some View {
        VStack(spacing: Space.xs) {
            Text("Scan your PYAAS pack")
                .textRole(.cardTitle).foregroundStyle(.white)
            Text("Point at the QR code on the carton or bottle.")
                .textRole(.caption).foregroundStyle(.white.opacity(0.8))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(Space.lg)
        .background(.ultraThinMaterial, in: RoundedRectangle.pyaas(Radius.card))
        .environment(\.colorScheme, .dark)
    }

    // MARK: Chrome

    private var chrome: some View {
        VStack {
            HStack {
                IconButton(systemName: "xmark", tint: .white, background: .white.opacity(0.16),
                           accessibilityLabel: "Close scanner") { dismiss() }
                Spacer()
                if permission == .authorized {
                    IconButton(systemName: torchOn ? "bolt.fill" : "bolt.slash",
                               tint: torchOn ? PyaasColor.gold : .white,
                               background: .white.opacity(0.16),
                               accessibilityLabel: torchOn ? "Turn torch off" : "Turn torch on") {
                        torchOn.toggle()
                    }
                }
            }
            .padding(.horizontal, Space.lg)
            Spacer()
        }
        .padding(.top, Space.sm)
    }

    // MARK: Overlays

    private var resolvingOverlay: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()
            VStack(spacing: Space.lg) {
                ProgressView().controlSize(.large).tint(.white)
                Text("Reading your pack…").textRole(.cardTitle).foregroundStyle(.white)
            }
        }
        .transition(.opacity)
    }

    private var failOverlay: some View {
        VStack {
            Spacer()
            VStack(spacing: Space.md) {
                Image(systemName: "qrcode.viewfinder").font(.largeTitle).foregroundStyle(PyaasColor.rose)
                Text(failMessage.isEmpty ? String(localized: "We couldn’t read that pack.") : failMessage)
                    .textRole(.body).foregroundStyle(.white).multilineTextAlignment(.center)
                PyaasButton("Scan again", systemImage: "arrow.clockwise", kind: .secondary, fullWidth: false) {
                    failMessage = ""
                    phase = .scanning
                    scanID = UUID()
                }
            }
            .padding(Space.xl)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial, in: RoundedRectangle.pyaas(Radius.sheet))
            .environment(\.colorScheme, .dark)
            .padding(Space.xl)
            Spacer()
        }
        .background(Color.black.opacity(0.55).ignoresSafeArea())
        .transition(.opacity)
    }

    // MARK: Denied

    private var deniedState: some View {
        VStack(spacing: Space.lg) {
            Image(systemName: "camera.metering.none").font(.system(size: 44)).foregroundStyle(PyaasColor.rose)
            Text("Camera access is off")
                .textRole(.displaySerif).foregroundStyle(.white)
            Text("To scan a pack and meet your farmers, turn on camera access for PYAAS in Settings.")
                .textRole(.body).foregroundStyle(.white.opacity(0.8)).multilineTextAlignment(.center)
            PyaasButton("Open Settings", kind: .secondary, fullWidth: false) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
        }
        .padding(Space.xxl)
    }

    // MARK: Logic

    private func handleFound(_ payload: String) {
        guard phase == .scanning else { return }
        Haptics.scanSuccess()
        withAnimation(Motion.fade) { phase = .resolving }
        Task {
            do {
                let passport = try await model.resolveScan(payload)
                onPassport(passport)
                dismiss()
            } catch {
                failMessage = (error as? APIError)?.userText ?? String(localized: "We couldn’t read that pack.")
                Haptics.error()
                withAnimation(Motion.fade) { phase = .failed }
            }
        }
    }

    private func requestPermission() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            permission = .authorized
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            permission = granted ? .authorized : .denied
        default:
            permission = .denied
        }
    }
}

/// One rounded corner bracket of the reticle.
struct ReticleCorner: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minX + 8))
        p.addQuadCurve(to: CGPoint(x: rect.minX + 8, y: rect.minY),
                       control: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        return p
    }
}
