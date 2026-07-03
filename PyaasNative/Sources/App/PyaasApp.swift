import SwiftUI

@main
struct PyaasApp: App {
    @State private var model = AppModel()
    @State private var showSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView()
                    .environment(model)

                if showSplash {
                    SplashView()
                        .transition(.opacity)
                        .zIndex(100)
                }
            }
            .tint(PyaasColor.roseDeep)
            .task {
                Haptics.prepare()
                try? await Task.sleep(for: .seconds(1.15))
                withAnimation(.easeOut(duration: 0.45)) { showSplash = false }
            }
        }
    }
}
