import SwiftUI

enum ShopRoute: Hashable { case cart, checkout }

/// Shop with Blinkit momentum: tight category browsing, a dense product grid,
/// instant add feedback, and a sticky cart that follows you.
struct ShopView: View {
    @Binding var tabBarHidden: Bool
    @Environment(AppModel.self) private var model
    @State private var category: Product.Category?
    @State private var path = NavigationPath()

    private let columns = [GridItem(.flexible(), spacing: Space.md), GridItem(.flexible(), spacing: Space.md)]

    var body: some View {
        NavigationStack(path: $path) {
            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(alignment: .leading, spacing: Space.xl) {
                        Text("Fresh from the farms, traced to your door.")
                            .textRole(.body)
                            .foregroundStyle(PyaasColor.inkMute)

                        categoryChips

                        LazyVGrid(columns: columns, spacing: Space.md) {
                            ForEach(Catalog.filtered(by: category)) { product in
                                ProductCard(
                                    product: product,
                                    qty: model.cart.qty(of: product.id),
                                    onOpen: { path.append(product) },
                                    onAdd: { withAnimation(Motion.snappy) { model.addToCart(product.id) } },
                                    onChange: { value in withAnimation(Motion.snappy) { model.cart.setQty(product.id, value) } }
                                )
                            }
                        }
                    }
                    .padding(.horizontal, Space.xl)
                    .padding(.top, Space.sm)
                }
                .scrollIndicators(.hidden)
                .clearsTabBar()

                if !model.cart.isEmpty {
                    cartBar
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .background(PyaasColor.background.ignoresSafeArea())
            .navigationTitle("Shop")
            .onChange(of: path.count) { _, depth in
                withAnimation(Motion.spring) { tabBarHidden = depth > 0 }
            }
            .onAppear { tabBarHidden = path.count > 0 }
            .navigationDestination(for: Product.self) { ProductDetailView(product: $0, path: $path) }
            .navigationDestination(for: ShopRoute.self) { route in
                switch route {
                case .cart: CartView(path: $path)
                case .checkout: CheckoutView(path: $path)
                }
            }
        }
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Space.sm) {
                Chip(title: "All", isSelected: category == nil) { withAnimation(Motion.snappy) { category = nil } }
                ForEach(Product.Category.allCases, id: \.self) { cat in
                    Chip(title: LocalizedStringKey(cat.rawValue.capitalized), isSelected: category == cat) {
                        withAnimation(Motion.snappy) { category = cat }
                    }
                }
            }
        }
        .scrollClipDisabled()
    }

    private var cartBar: some View {
        Button {
            Haptics.light()
            path.append(ShopRoute.cart)
        } label: {
            HStack(spacing: Space.md) {
                ZStack {
                    Image(systemName: "bag.fill").font(.headline).foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(model.cart.itemCount) item\(model.cart.itemCount == 1 ? "" : "s")")
                        .textRole(.bodyStrong).foregroundStyle(.white)
                    Text(model.cart.subtotal.formatted)
                        .textRole(.caption).foregroundStyle(.white.opacity(0.9))
                }
                Spacer()
                Text("View cart").textRole(.button).foregroundStyle(.white)
                Image(systemName: "arrow.right").font(.subheadline.weight(.bold)).foregroundStyle(.white)
            }
            .padding(.horizontal, Space.xl)
            .padding(.vertical, Space.md)
            .background(PyaasColor.brandGradient, in: RoundedRectangle.pyaas(Radius.control))
            .pyaasShadow(.lifted)
        }
        .buttonStyle(PressScale())
        .padding(.horizontal, Space.xl)
        .padding(.bottom, 96)
        .accessibilityLabel("View cart, \(model.cart.itemCount) items, \(model.cart.subtotal.formatted)")
    }
}
