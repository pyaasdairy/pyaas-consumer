package `in`.pyaasdairy.app.nativeconvenience

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64

/**
 * Computes the 11-character app-signature hash that the SMS Retriever API requires
 * the OTP SMS to be suffixed with (e.g. "…your code is 123456\n\nFA+9qCX9VSu").
 * Surface this via getAppHash() to whoever authors the OTP SMS template.
 */
class AppSignatureHelper(private val context: Context) {

  fun getAppSignatures(): List<String> {
    val signatures = mutableListOf<String>()
    try {
      val packageName = context.packageName
      val pm = context.packageManager
      val signaturesArr = if (Build.VERSION.SDK_INT >= 28) {
        val info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        info.signingInfo?.apkContentsSigners
      } else {
        @Suppress("DEPRECATION")
        val info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
        @Suppress("DEPRECATION")
        info.signatures
      } ?: return signatures

      for (signature in signaturesArr) {
        hash(packageName, signature.toCharsString())?.let { signatures.add(it) }
      }
    } catch (e: Throwable) {
      // package/signature unavailable — return whatever we have
    }
    return signatures
  }

  private fun hash(packageName: String, signature: String): String? {
    val appInfo = "$packageName $signature"
    return try {
      val md = MessageDigest.getInstance(HASH_TYPE)
      md.update(appInfo.toByteArray(StandardCharsets.UTF_8))
      var hashSignature = md.digest()
      hashSignature = hashSignature.copyOfRange(0, NUM_HASHED_BYTES)
      val base64Hash =
        if (Build.VERSION.SDK_INT >= 26) {
          Base64.getEncoder()
            .withoutPadding()
            .encodeToString(hashSignature)
        } else {
          @Suppress("DEPRECATION")
          android.util.Base64.encodeToString(
            hashSignature,
            android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP
          )
        }
      base64Hash.substring(0, NUM_BASE64_CHAR)
    } catch (e: Throwable) {
      null
    }
  }

  companion object {
    private const val HASH_TYPE = "SHA-256"
    private const val NUM_HASHED_BYTES = 9
    private const val NUM_BASE64_CHAR = 11
  }
}
