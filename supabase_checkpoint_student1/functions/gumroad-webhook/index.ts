import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function log(level: string, message: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const payload = extra ? { ...extra } : {};
  console.log(JSON.stringify({ ts, level, message, ...payload }));
}

// Robust book lookup: try gumroad_permalink exact match first, then gumroad_url exact match,
// then gumroad_url suffix match (handles case where Gumroad sends just the short code).
async function findBook(supabase: any, productPermalink: string): Promise<{ id: string; title: string } | null> {
  if (!productPermalink) return null;

  const { data: byPermalink } = await supabase
    .from("books").select("id, title").eq("gumroad_permalink", productPermalink).maybeSingle();
  if (byPermalink) return byPermalink;

  const { data: byUrl } = await supabase
    .from("books").select("id, title").eq("gumroad_url", productPermalink).maybeSingle();
  if (byUrl) return byUrl;

  const { data: books } = await supabase.from("books").select("id, title, gumroad_url");
  if (books) {
    const match = books.find((b: any) => b.gumroad_url && b.gumroad_url.endsWith("/" + productPermalink));
    if (match) return { id: match.id, title: match.title };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  log("info", "Request received", {
    method: req.method,
    url: req.url,
    contentType: req.headers.get("Content-Type"),
    hasAuth: !!req.headers.get("Authorization"),
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    log("warn", "Method not allowed", { method: req.method });
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse request body — Gumroad sends application/x-www-form-urlencoded
    const contentType = req.headers.get("Content-Type") || "";
    let form: Record<string, string> = {};

    log("info", "Parsing body", { contentType });

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        form[key] = String(value);
      }
    } else if (contentType.includes("application/json")) {
      const json = await req.json();
      form = typeof json === "object" && json !== null ? json as Record<string, string> : {};
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        form[key] = String(value);
      }
    } else {
      // Fallback: try parsing as URL-encoded text (Gumroad may not send Content-Type)
      const text = await req.text();
      if (text) {
        try {
          const params = new URLSearchParams(text);
          for (const [key, value] of params.entries()) {
            form[key] = value;
          }
        } catch {
          try {
            const json = JSON.parse(text);
            form = typeof json === "object" && json !== null ? json as Record<string, string> : {};
          } catch {
            log("warn", "Could not parse body as form or JSON", { text: text.slice(0, 500) });
          }
        }
      }
    }

    log("info", "Parsed form fields", {
      keys: Object.keys(form),
      fieldCount: Object.keys(form).length,
    });

    // Gumroad Ping fields
    const offerCode = form.offer_code || form.offerCode || "";
    const productPermalink = form.product_permalink || form.product_id || form.productPermalink || "";
    const price = parseFloat(form.price || "0");
    const saleTimestamp = form.sale_timestamp || form.created_at || new Date().toISOString();
    const refunded = form.refunded === "true" || form.refunded === "1";
    const gumroadSaleId = form.id || form.sale_id || "";

    // If there's no offer_code, this is a non-referral sale (direct purchase).
    // Record it as a direct sale with no seller attribution.
    if (!offerCode) {
      log("info", "No offer_code — recording as direct sale", {
        fields: Object.keys(form),
        productPermalink,
      });

      const directBook = await findBook(supabase, productPermalink);

      if (!directBook) {
        log("warn", "No book found for direct sale product_permalink", { productPermalink });
        return new Response(
          JSON.stringify({ success: true, message: "No book found for product_permalink, acknowledged" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Idempotency check for direct sales
      if (gumroadSaleId) {
        const { data: existingDirect } = await supabase
          .from("sales")
          .select("id")
          .eq("gumroad_sale_id", gumroadSaleId)
          .maybeSingle();
        if (existingDirect) {
          log("info", "Duplicate webhook — direct sale already recorded", { gumroadSaleId });
          return new Response(
            JSON.stringify({ success: true, message: "Direct sale already recorded (duplicate webhook)" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Handle refund for direct sales
      if (refunded && gumroadSaleId) {
        const { data: existingRefund } = await supabase
          .from("sales")
          .select("id")
          .eq("gumroad_sale_id", gumroadSaleId)
          .maybeSingle();
        if (existingRefund) {
          await supabase.from("sales").update({ refunded: true }).eq("id", existingRefund.id);
          log("info", "Direct sale marked as refunded", { gumroadSaleId, book: directBook.title });
          return new Response(
            JSON.stringify({ success: true, message: "Direct sale marked as refunded", book: directBook.title }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      let directSaleDate: string;
      try {
        directSaleDate = new Date(saleTimestamp).toISOString().slice(0, 10);
      } catch {
        directSaleDate = new Date().toISOString().slice(0, 10);
      }

      const { error: directInsertErr } = await supabase.from("sales").insert({
        seller_id: null,
        book_id: directBook.id,
        amount: price,
        sale_date: directSaleDate,
        gumroad_sale_id: gumroadSaleId || null,
        refunded: false,
        is_direct_sale: true,
      });

      if (directInsertErr) {
        log("error", "Failed to create direct sale", { error: directInsertErr.message, gumroadSaleId });
        return new Response(
          JSON.stringify({ error: "Failed to create direct sale: " + directInsertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      log("info", "Direct sale recorded", { book: directBook.title, amount: price, directSaleDate });
      return new Response(
        JSON.stringify({
          success: true,
          message: "Direct sale recorded",
          book: directBook.title,
          amount: price,
          sale_date: directSaleDate,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Match offer_code to a seller
    const { data: seller, error: sellerErr } = await supabase
      .from("sellers")
      .select("id, shop_name, email")
      .eq("offer_code", offerCode)
      .eq("approval_status", "approved")
      .maybeSingle();

    if (sellerErr) {
      log("error", "Seller lookup failed", { offerCode, error: sellerErr.message });
      return new Response(
        JSON.stringify({ error: "Database error looking up seller" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!seller) {
      log("warn", "No approved seller found for offer_code", { offerCode });
      return new Response(
        JSON.stringify({ success: true, message: "No approved seller found for offer_code, acknowledged" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const book = await findBook(supabase, productPermalink);

    if (!book) {
      log("warn", "No book found for product_permalink", { productPermalink, offerCode });
      return new Response(
        JSON.stringify({ success: true, message: "No book found for product_permalink, acknowledged" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse sale date
    let saleDate: string;
    try {
      saleDate = new Date(saleTimestamp).toISOString().slice(0, 10);
    } catch {
      saleDate = new Date().toISOString().slice(0, 10);
    }

    // Handle refund
    if (refunded && gumroadSaleId) {
      const { data: existingSale } = await supabase
        .from("sales")
        .select("id")
        .eq("gumroad_sale_id", gumroadSaleId)
        .maybeSingle();

      if (existingSale) {
        await supabase
          .from("sales")
          .update({ refunded: true })
          .eq("id", existingSale.id);
        log("info", "Sale marked as refunded", { gumroadSaleId, seller: seller.shop_name, book: book.title });
        return new Response(
          JSON.stringify({ success: true, message: "Sale marked as refunded", seller: seller.shop_name, book: book.title }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      log("info", "Refund received but no matching sale", { gumroadSaleId });
      return new Response(
        JSON.stringify({ success: true, message: "Refund received but no matching sale found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency check
    if (gumroadSaleId) {
      const { data: existingSale } = await supabase
        .from("sales")
        .select("id")
        .eq("gumroad_sale_id", gumroadSaleId)
        .maybeSingle();

      if (existingSale) {
        log("info", "Duplicate webhook — sale already recorded", { gumroadSaleId });
        return new Response(
          JSON.stringify({ success: true, message: "Sale already recorded (duplicate webhook)" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create sale record
    const { error: insertErr } = await supabase.from("sales").insert({
      seller_id: seller.id,
      book_id: book.id,
      amount: price,
      sale_date: saleDate,
      gumroad_sale_id: gumroadSaleId || null,
      refunded: false,
    });

    if (insertErr) {
      log("error", "Failed to create sale", { error: insertErr.message, gumroadSaleId });
      return new Response(
        JSON.stringify({ error: "Failed to create sale: " + insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("info", "Sale recorded", { seller: seller.shop_name, book: book.title, amount: price, saleDate });
    return new Response(
      JSON.stringify({
        success: true,
        message: "Sale recorded automatically",
        seller: seller.shop_name,
        book: book.title,
        amount: price,
        sale_date: saleDate,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log("error", "Unhandled error", { message: (err as Error).message, stack: (err as Error).stack });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
