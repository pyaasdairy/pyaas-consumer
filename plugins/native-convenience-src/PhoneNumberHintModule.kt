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
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

/**
 * RNPhoneNumberHint — the native "hyper-convenience" login seam the JS layer
 * (lib/nativeConvenience.ts) looks up on NativeModules.RNPhoneNumberHint.
 *
 *   requestHint()        one-tap Google Play Services Phone Number Hint chooser →
 *                        resolves the SIM's own number (or null if declined/absent).
 *   startSmsRetriever()  Play Services SMS Retriever API (NO SMS permission) → emits
 *                        the incoming OTP SMS body on the "pyaasSmsOtp" event.
 *   getAppHash()         the 11-char app-signature hash the OTP SMS must end with
 *                        for SMS Retriever to deliver it (hand to the SMS template).
 *
 * Everything degrades to a null/false no-op when Play Services is unavailable, so
 * the JS callers treat that as "user will type" — the app never breaks.
 */
class PhoneNumberHintModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var hintPromise: Promise? = null
  private var smsReceiver: BroadcastReceiver? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = "RNPhoneNumberHint"

  // ── Phone Number Hint ──────────────────────────────────────────────────────

  @ReactMethod
  fun requestHint(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null || hintPromise != null) {
      promise.resolve(null) // no activity, or a request already in flight
      return
    }
    hintPromise = promise
    try {
      val request = GetPhoneNumberHintIntentRequest.builder().build()
      Identity.getSignInClient(activity)
        .getPhoneNumberHintIntent(request)
        .addOnSuccessListener { result ->
          try {
            activity.startIntentSenderForResult(result.intentSender, REQ_PHONE_HINT, null, 0, 0, 0)
          } catch (e: Exception) {
            resolveHint(null)
          }
        }
        .addOnFailureListener { resolveHint(null) }
    } catch (e: Throwable) {
      resolveHint(null) // Play Services missing / any error
    }
  }

  private fun resolveHint(value: String?) {
    val p = hintPromise
    hintPromise = null
    p?.resolve(value)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_PHONE_HINT) return
    if (resultCode == Activity.RESULT_OK && data != null) {
      try {
        resolveHint(Identity.getSignInClient(activity).getPhoneNumberFromIntent(data))
      } catch (e: Exception) {
        resolveHint(null)
      }
    } else {
      resolveHint(null) // cancelled
    }
  }

  override fun onNewIntent(intent: Intent) {}

  // ── SMS Retriever (OTP auto-read, no SMS permission) ───────────────────────

  @ReactMethod
  fun startSmsRetriever(promise: Promise) {
    try {
      registerSmsReceiver()
      SmsRetriever.getClient(reactContext).startSmsRetriever()
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { promise.resolve(false) }
    } catch (e: Throwable) {
      promise.resolve(false)
    }
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

  private fun registerSmsReceiver() {
    if (smsReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
        val extras = intent.extras ?: return
        val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
        if (status.statusCode == CommonStatusCodes.SUCCESS) {
          val message = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE)
          val map = Arguments.createMap().apply { putString("message", message) }
          reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("pyaasSmsOtp", map)
        }
      }
    }
    val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
    if (Build.VERSION.SDK_INT >= 33) {
      reactContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(receiver, filter)
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
    private const val REQ_PHONE_HINT = 71072
  }
}
