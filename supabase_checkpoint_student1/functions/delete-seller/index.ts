import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { seller_id } = await req.json();
    if (!seller_id) {
      return new Response(JSON.stringify({ error: "seller_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Delete related data
    await supabase.from("sales").delete().eq("seller_id", seller_id);
    await supabase.from("payouts").delete().eq("seller_id", seller_id);
    await supabase.from("chat_messages").delete().eq("seller_id", seller_id);
    await supabase.from("seller_notifications").delete().eq("seller_id", seller_id);
    await supabase.from("seller_seen_books").delete().eq("seller_id", seller_id);
    await supabase.from("sellers").delete().eq("id", seller_id);

    // Delete auth user
    await supabase.auth.admin.deleteUser(seller_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
