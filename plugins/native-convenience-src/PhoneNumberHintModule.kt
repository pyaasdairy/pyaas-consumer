package `in`.pyaasdairy.app.nativeconvenience

import android.app.Activity
import android.app.PendingIntent
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
import com.google.android.gms.auth.api.credentials.Credential
import com.google.android.gms.auth.api.credentials.Credentials
import com.google.android.gms.auth.api.credentials.HintRequest
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

/**
 * RNPhoneNumberHint — the native "hyper-convenience" login seam the JS layer
 * (lib/nativeConvenience.ts) looks up on NativeModules.RNPhoneNumberHint.
 *
 *   requestHint()        the phone-number chooser. PREFERRED UI: the legacy
 *                        Smart Lock hint picker (Credentials.getHintPickerIntent,
 *                        the light centred "Continue with" dialog listing BOTH
 *                        SIM numbers — the reference UX). Deprecated upstream but
 *                        still functional with play-services-auth 20.7.0; any
 *                        failure falls back to the newer Identity Phone Number
 *                        Hint bottom sheet. Resolves the picked number, or null.
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
 * No runtime permission is requested by ANY of these — no READ_PHONE_NUMBERS,
 * no RECEIVE_SMS. Everything degrades to a null/false no-op when Play Services
 * is unavailable, so the JS callers treat that as "user will type".
 */
class PhoneNumberHintModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var hintPromise: Promise? = null
  private var smsReceiver: BroadcastReceiver? = null

  /** True once an SMS body has been delivered this arming — stops the one-tap
   *  consent dialog from ALSO popping for a code the silent Retriever already
   *  read (once the SMS template carries the app hash, login is zero-dialog). */
  @Volatile private var delivered = false

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = "RNPhoneNumberHint"

  // ── Phone number chooser ───────────────────────────────────────────────────

  @ReactMethod
  fun requestHint(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null || hintPromise != null) {
      promise.resolve(null) // no activity, or a request already in flight
      return
    }
    hintPromise = promise
    // 1) Legacy Smart Lock hint picker — the light centred "Continue with"
    //    dialog that lists every SIM number (the UX the product wants).
    //    Throwable catch: if a future dep bump strips the Credentials class,
    //    this NoClassDefFoundErrors into the Identity fallback below.
    try {
      val hintRequest = HintRequest.Builder().setPhoneNumberIdentifierSupported(true).build()
      val pi: PendingIntent = Credentials.getClient(activity).getHintPickerIntent(hintRequest)
      activity.startIntentSenderForResult(pi.intentSender, REQ_PHONE_HINT_LEGACY, null, 0, 0, 0)
      return
    } catch (e: Throwable) {
      // fall through to the Identity bottom sheet
    }
    // 2) Fallback: the newer Identity Phone Number Hint (dark bottom sheet).
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
    when (requestCode) {
      REQ_PHONE_HINT_LEGACY -> {
        if (resultCode == Activity.RESULT_OK && data != null) {
          try {
            @Suppress("DEPRECATION")
            val credential: Credential? = data.getParcelableExtra(Credential.EXTRA_KEY)
            resolveHint(credential?.id)
          } catch (e: Throwable) {
            resolveHint(null)
          }
        } else {
          resolveHint(null) // cancelled / "None of the above"
        }
      }
      REQ_PHONE_HINT -> {
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
    private const val REQ_PHONE_HINT = 71072
    private const val REQ_PHONE_HINT_LEGACY = 71073
    private const val REQ_SMS_CONSENT = 71074
  }
}
