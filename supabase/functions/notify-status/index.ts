// notify-status - sends the customer an SMS when their order status changes
// ("confirmed", "out_for_delivery", "delivered", …). Wire it as a Supabase
// **Database Webhook** on `orders` (UPDATE of `status`) → this function.
//
// Secrets (set via `supabase secrets set` or dashboard):
//   MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TXN_TEMPLATE_ID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (to look up the customer's phone)
//
// Deploy: supabase functions deploy notify-status --no-verify-jwt
//
// PLACEHOLDER NOTE: until a DLT-approved transactional template id is set in
// MSG91_TXN_TEMPLATE_ID (and the account has balance), this logs the message
// and returns 200 without sending - so order flow never breaks.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MESSAGES: Record<string, string> = {
  confirmed: "Your PYAAS order is confirmed. We'll text you when it's out for delivery.",
  preparing: "Your PYAAS milk is being prepared fresh.",
  assigned: "A PYAAS rider has been assigned to your order.",
  out_for_delivery: "Your PYAAS milk is out for delivery and arriving soon!",
  delivered: "Delivered! Thank you for choosing PYAAS. Know your milk.",
  cancelled: "Your PYAAS order was cancelled. Any wallet charge is refunded.",
};

serve(async (req) => {
  try {
    const payload = await req.json();
    // Supabase DB webhook shape: { type, table, record, old_record }
    const record = payload?.record ?? payload;
    const oldRecord = payload?.old_record ?? null;
    const status: string = record?.status ?? "";
    const userId: string = record?.user_id ?? "";

    // Only act on a real status change we have copy for.
    if (oldRecord && oldRecord.status === status) return new Response("no change", { status: 200 });
    const text = MESSAGES[status];
    if (!text || !userId) return new Response("nothing to send", { status: 200 });

    // Look up the customer's phone via service role.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return new Response("supabase env missing", { status: 500 });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin.from("profiles").select("phone").eq("id", userId).maybeSingle();
    const phone = (profile?.phone ?? "").replace(/\D/g, "");
    if (!phone) return new Response("no phone", { status: 200 });
    const mobiles = phone.startsWith("91") ? phone : `91${phone.slice(-10)}`;

    const authkey = Deno.env.get("MSG91_AUTH_KEY");
    const template_id = Deno.env.get("MSG91_TXN_TEMPLATE_ID");
    const sender = Deno.env.get("MSG91_SENDER_ID") ?? "PYAASD";

    // Placeholder mode: no template/key yet → log + succeed (don't block orders).
    if (!authkey || !template_id) {
      console.log("[notify-status placeholder]", { mobiles, status, text });
      return new Response(JSON.stringify({ placeholder: true, status, text }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id, sender, short_url: "0",
        recipients: [{ mobiles, status, message: text, var1: text }],
      }),
    });
    const body = await res.text();
    let parsed: any = null; try { parsed = JSON.parse(body); } catch { /* */ }
    if (!res.ok || parsed?.type === "error") {
      console.error("MSG91 notify failed", { status: res.status, body });
      return new Response(JSON.stringify({ error: "msg91_failed", body }), { status: 502 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
