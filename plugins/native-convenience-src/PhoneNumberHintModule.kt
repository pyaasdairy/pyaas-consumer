package `in`.pyaasdairy.app.nativeconvenience

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

/**
 * RNPhoneNumberHint — the native OTP auto-read seam the JS layer
 * (lib/nativeConvenience.ts) looks up on NativeModules.RNPhoneNumberHint.
 *
 *   startSmsRetriever()  arms BOTH SMS auto-read paths at once:
 *                        (a) SMS Retriever — zero-tap, but the SMS must end with
 *                            the 11-char app hash (getAppHash) or it never fires;
 *                        (b) SMS User Consent — no hash needed; Play Services
 *                            shows a one-tap "Allow" dialog, then hands over the
 *                            SMS body. Whichever fires first wins; both emit the
 *                            body on the "pyaasSmsOtp" event.
 *   getAppHash()         the 11-char app-signature hash the OTP SMS must end with
 *                        for zero-tap Retriever delivery (put it in the DLT/MSG91
 *                        template).
 *
 * REMOVED — the phone-number chooser (requestHint). The Play Services phone-number
 * hint (Credentials.getHintPickerIntent / Identity.getPhoneNumberHintIntent) READ
 * THE SIM'S OWN NUMBER, and Google Play removed this app under the User Data policy
 * for uploading the phone number without a prominent disclosure. The capability is
 * gone from this module, from lib/nativeConvenience.ts, from the sign-in screen and
 * from the build's dependencies — the member types their number, or uses ordinary OS
 * autofill (autoComplete="tel"), which involves no SIM read by this app.
 *
 * No runtime permission is requested by anything here — no READ_PHONE_NUMBERS, no
 * RECEIVE_SMS. Everything degrades to a null/false no-op when Play Services is
 * unavailable, so the JS callers treat that as "user will type".
 */
class PhoneNumberHintModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var smsReceiver: BroadcastReceiver? = null

  /** True once an SMS body has been delivered this arming — stops the one-tap
   *  consent dialog from ALSO popping for a code the silent Retriever already
   *  read (once the SMS template carries the app hash, login is zero-dialog). */
  @Volatile private var delivered = false

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = "RNPhoneNumberHint"

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    when (requestCode) {
      REQ_SMS_CONSENT -> {
        // User tapped "Allow" on the one-tap consent dialog → the SMS body.
        if (resultCode == Activity.RESULT_OK && data != null) {
          val message = data.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)
          if (message != null) emitSms(message)
        }
        // RESULT_CANCELED (Deny) → do nothing; the member types the code.
      }
    }
  }

  override fun onNewIntent(intent: Intent) {}

  // ── SMS auto-read (Retriever + User Consent, no SMS permission) ────────────

  @ReactMethod
  fun startSmsRetriever(promise: Promise) {
    try {
      delivered = false // fresh arming — a new code may arrive
      registerSmsReceiver()
      armSmsClients()
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  /** Arm both delivery paths; each is best-effort on its own. */
  private fun armSmsClients() {
    val client = SmsRetriever.getClient(reactContext)
    try {
      client.startSmsRetriever() // zero-tap; needs the app hash in the SMS
    } catch (e: Throwable) { /* best-effort */ }
    try {
      client.startSmsUserConsent(null) // hash-free; one-tap "Allow" dialog
    } catch (e: Throwable) { /* best-effort */ }
  }

  @ReactMethod
  fun stopSmsRetriever() {
    unregisterSmsReceiver()
  }

  @ReactMethod
  fun getAppHash(promise: Promise) {
    try {
      val hashes = AppSignatureHelper(reactContext).getAppSignatures()
      promise.resolve(hashes.firstOrNull())
    } catch (e: Throwable) {
      promise.resolve(null)
    }
  }

  private fun emitSms(message: String) {
    delivered = true
    val map = Arguments.createMap().apply { putString("message", message) }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("pyaasSmsOtp", map)
  }

  private fun registerSmsReceiver() {
    if (smsReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
        val extras = intent.extras ?: return
        val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
        when (status.statusCode) {
          CommonStatusCodes.SUCCESS -> {
            // Retriever path (hash matched): the SMS body arrives directly.
            val message = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE)
            if (message != null) {
              emitSms(message)
              return
            }
            // User Consent path: Play Services hands us a consent intent —
            // launching it shows the one-tap "Allow" dialog; the body comes
            // back through onActivityResult(REQ_SMS_CONSENT).
            @Suppress("DEPRECATION")
            val consentIntent: Intent? = extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT)
            if (consentIntent != null && !delivered) {
              try {
                reactContext.currentActivity?.startActivityForResult(consentIntent, REQ_SMS_CONSENT)
              } catch (e: Throwable) { /* activity gone — member types */ }
            }
          }
          CommonStatusCodes.TIMEOUT -> {
            // Each arm times out after ~5 min; re-arm while the code screen
            // still has us registered so a slow SMS is never missed.
            armSmsClients()
          }
        }
      }
    }
    val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
    // SEND_PERMISSION: only Play Services may deliver this broadcast to us.
    if (Build.VERSION.SDK_INT >= 33) {
      reactContext.registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null)
    }
    smsReceiver = receiver
  }

  private fun unregisterSmsReceiver() {
    smsReceiver?.let {
      try {
        reactContext.unregisterReceiver(it)
      } catch (e: Exception) { /* already gone */ }
    }
    smsReceiver = null
  }

  // NativeEventEmitter contract (New Architecture requires these on the module).
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  override fun invalidate() {
    unregisterSmsReceiver()
    super.invalidate()
  }

  companion object {
    private const val REQ_SMS_CONSENT = 71074
  }
}
