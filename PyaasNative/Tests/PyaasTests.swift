import XCTest
@testable import PYAAS

/// Unit tests for the money / parse / cart logic — the layers where a silent
/// off-by-one or a 100× error would be a real bug.
final class PyaasTests: XCTestCase {

    // MARK: Money

    func testMoneyRupeesToPaise() {
        XCTAssertEqual(Money(rupees: 139).paise, 13900)
        XCTAssertEqual(Money(paise: 13900).paise, 13900)
        XCTAssertEqual(Money.zero.paise, 0)
    }

    func testMoneyArithmetic() {
        let a = Money(rupees: 100)
        let b = Money(rupees: 49)
        XCTAssertEqual((a + b).paise, 14900)
        XCTAssertEqual((a - b).paise, 5100)
        XCTAssertEqual((b * 3).paise, 14700)
        XCTAssertTrue(b < a)
    }

    func testMoneySequenceTotal() {
        let total = [Money(rupees: 139), Money(rupees: 89), Money(rupees: 44)].total()
        XCTAssertEqual(total.paise, 27200)
    }

    func testMoneyFormatsWholeAndFractional() {
        // ₹ symbol + en_IN grouping; no decimals when whole.
        XCTAssertTrue(Money(rupees: 1099).formatted.contains("1,099"))
        XCTAssertFalse(Money(rupees: 1099).formatted.contains(".00"))
        XCTAssertTrue(Money(paise: 13950).formatted.contains(".50"))
    }

    // MARK: QR token parsing

    func testQRTokenFromRaw() {
        XCTAssertEqual(QRPayload.token(from: "ABC123XYZ"), "ABC123XYZ")
    }

    func testQRTokenFromURLAndDeepLink() {
        XCTAssertEqual(QRPayload.token(from: "https://trace.pyaas.in/b/PYAAS-LKO-001"), "PYAAS-LKO-001")
        XCTAssertEqual(QRPayload.token(from: "pyaas://trace/tok_998877"), "tok_998877")
    }

    func testQRTokenRejectsJunk() {
        XCTAssertNil(QRPayload.token(from: ""))
        XCTAssertNil(QRPayload.token(from: "   "))
        XCTAssertNil(QRPayload.token(from: "ab")) // too short
    }

    // MARK: ISO date

    func testISODateParsing() {
        XCTAssertNotNil(ISODate.parse("2026-06-14T06:40:00Z"))
        XCTAssertNotNil(ISODate.parse("2026-06-14T06:40:00.123Z"))
        XCTAssertNil(ISODate.parse(nil))
        XCTAssertNil(ISODate.parse(""))
    }

    // MARK: Cart

    func testCartAddRespectsPerProductCap() {
        var cart = Cart()
        cart.add("a2-1l", qty: 100)
        XCTAssertEqual(cart.qty(of: "a2-1l"), Cart.maxPerProduct)
    }

    func testCartSubtotalAndSavings() {
        var cart = Cart()
        cart.add("a2-1l", qty: 2) // ₹139, MRP ₹169
        XCTAssertEqual(cart.subtotal.paise, 27800)
        XCTAssertEqual(cart.savings.paise, 6000) // (169-139)*2*100
        XCTAssertEqual(cart.itemCount, 2)
    }

    func testCartSetQtyZeroRemovesLine() {
        var cart = Cart()
        cart.add("ghee")
        cart.setQty("ghee", 0)
        XCTAssertTrue(cart.isEmpty)
    }

    // MARK: Billing

    func testFreeDeliveryThreshold() {
        var cart = Cart()
        cart.add("toned-pouch") // ₹44 → below ₹199
        XCTAssertEqual(Billing(cart: cart).deliveryFee, Billing.deliveryCharge)
        cart.add("ghee") // ₹1099 → above threshold
        XCTAssertEqual(Billing(cart: cart).deliveryFee, .zero)
    }

    // MARK: Passport derivation

    func testQualityDerivationFromColdChain() {
        let warm = Passport.quality(adulteration: true, checks: 6, temperatureC: 9)
        XCTAssertFalse(warm.coldChain)
        let cold = Passport.quality(adulteration: true, checks: 6, temperatureC: 4)
        XCTAssertTrue(cold.coldChain)
        XCTAssertTrue(cold.allPassed)
        let unknownTemp = Passport.quality(adulteration: true, checks: nil, temperatureC: nil)
        XCTAssertTrue(unknownTemp.coldChain) // assumed maintained when unknown
    }

    func testTokenPassportRequiresVerified() {
        let unverified = TokenPassportDTO(verified: false)
        XCTAssertNil(Passport.from(token: unverified))
    }

    // MARK: Order state machine

    func testOrderStatusFlow() {
        XCTAssertEqual(OrderStatus.placed.flowIndex, 0)
        XCTAssertEqual(OrderStatus.delivered.flowIndex, OrderStatus.flow.count - 1)
        XCTAssertTrue(OrderStatus.outForDelivery.isLive)
        XCTAssertTrue(OrderStatus.delivered.isTerminal)
        XCTAssertTrue(OrderStatus.cancelled.isTerminal)
    }
}
