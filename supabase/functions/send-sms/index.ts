// Supabase "Send SMS Hook" → sends the login OTP via MSG91.
// Deployed as an Edge Function and wired under Auth → Hooks → Send SMS Hook.
// Secrets used (set via `supabase secrets set` or the dashboard):
//   MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID, MSG91_SENDER_ID
//
// Deploy:  supabase functions deploy send-sms --no-verify-jwt
//
// NOTE: the variable name in the MSG91 flow body ("otp"/"OTP"/"var1") must match
// the variable you defined in your DLT-approved MSG91 template. We send a few
// common aliases so it works regardless; trim to the real one once confirmed.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const payload = await req.json();

    // Supabase Send SMS Hook payload: { user: { phone }, sms: { otp } }
    const rawPhone: string = payload?.user?.phone ?? payload?.phone ?? "";
    const otp: string = payload?.sms?.otp ?? payload?.otp ?? "";
    const digits = rawPhone.replace(/\D/g, "");
    const mobiles = digits.startsWith("91") ? digits : `91${digits.slice(-10)}`;

    if (!digits || !otp) {
      return new Response(JSON.stringify({ error: "missing phone or otp" }), { status: 400 });
    }

    const authkey = Deno.env.get("MSG91_AUTH_KEY");
    const template_id = Deno.env.get("MSG91_OTP_TEMPLATE_ID");
    const sender = Deno.env.get("MSG91_SENDER_ID") ?? "PYAASD";
    if (!authkey || !template_id) {
      return new Response(JSON.stringify({ error: "MSG91 secrets not configured" }), { status: 500 });
    }

    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id,
        sender,
        short_url: "0",
        recipients: [{ mobiles, otp: String(otp), OTP: String(otp), var1: String(otp) }],
      }),
    });

    const body = await res.text();
    // MSG91 returns HTTP 200 even for logical errors (e.g. {"type":"error"}),
    // so inspect the body, not just res.ok.
    let parsed: any = null;
    try { parsed = JSON.parse(body); } catch { /* not json */ }
    const msg91Failed = !res.ok || parsed?.type === "error";
    if (msg91Failed) {
      console.error("MSG91 send failed", { status: res.status, body, mobiles });
      return new Response(JSON.stringify({ error: "msg91_failed", status: res.status, msg91: parsed ?? body }), { status: 502 });
    }
    console.log("MSG91 send ok", { mobiles, body });
    return new Response(JSON.stringify({ success: true, msg91: parsed ?? body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
