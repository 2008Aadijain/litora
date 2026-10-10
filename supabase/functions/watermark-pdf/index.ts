import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

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
    const { path } = await req.json();
    if (!path) {
      return new Response(JSON.stringify({ error: "path is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Download the raw PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage.from("sample-pdfs").download(path);
    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: "Failed to download PDF from storage" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();

      // Draw "L" logo mark — bold, slightly larger
      const logoText = "L";
      const logoSize = 14;
      const logoWidth = helveticaBold.widthOfTextAtSize(logoText, logoSize);

      // Draw "Litora" brand text — regular, smaller
      const brandText = "Litora";
      const brandSize = 8;
      const brandWidth = helvetica.widthOfTextAtSize(brandText, brandSize);

      // Position in bottom-right corner with margin
      const margin = 20;
      const gap = 4;
      const totalWidth = logoWidth + gap + brandWidth;
      const startX = width - totalWidth - margin;
      const y = margin;

      // Draw "L" logo
      page.drawText(logoText, {
        x: startX,
        y,
        size: logoSize,
        font: helveticaBold,
        color: rgb(0.55, 0.47, 0.40),
        opacity: 0.45,
      });

      // Draw "Litora" text next to the L
      page.drawText(brandText, {
        x: startX + logoWidth + gap,
        y: y + 3,
        size: brandSize,
        font: helvetica,
        color: rgb(0.55, 0.47, 0.40),
        opacity: 0.45,
      });
    }

    const watermarkedBytes = await pdfDoc.save();

    // Always save to a distinct watermarked path to avoid overwriting then deleting the same file
    const baseName = path.replace(/^raw-/, "").replace(/^wm-/, "");
    const watermarkedPath = `wm-${baseName}`;

    const { error: uploadError } = await supabase.storage
      .from("sample-pdfs")
      .upload(watermarkedPath, watermarkedBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return new Response(JSON.stringify({ error: "Failed to upload watermarked PDF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete the original raw PDF only if it's different from the watermarked path
    if (path !== watermarkedPath) {
      await supabase.storage.from("sample-pdfs").remove([path]);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage.from("sample-pdfs").getPublicUrl(watermarkedPath);

    return new Response(JSON.stringify({ publicUrl: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
