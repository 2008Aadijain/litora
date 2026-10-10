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
    const { author_id } = await req.json();
    if (!author_id) {
      return new Response(JSON.stringify({ error: "author_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") || "";
    const userToken = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(userToken);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabase.rpc("is_admin", {}, { headers: { Authorization: `Bearer ${userToken}` } });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete related data
    await supabase.from("author_chat_messages").delete().eq("author_id", author_id);
    await supabase.from("author_notifications").delete().eq("author_id", author_id);
    await supabase.from("author_payouts").delete().eq("author_id", author_id);
    await supabase.from("author_books").delete().eq("author_id", author_id);
    await supabase.from("authors").delete().eq("id", author_id);

    // Delete auth user
    await supabase.auth.admin.deleteUser(author_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
