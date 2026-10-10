import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { supabase } from "./supabase";
import { theme as h } from "./theme";

function num(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export function buildReferralUrl(referralCode: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://litora.app";
  return `${origin}/?ref=${encodeURIComponent(referralCode)}`;
}

export async function generateQrDataUrl(text: string, opts?: { dark?: boolean; margin?: number }): Promise<string> {
  const dark = opts?.dark ?? true;
  const margin = opts?.margin ?? 2;
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "H",
    margin,
    width: 400,
    color: {
      dark: dark ? h.color.ink : "#000000",
      light: "#ffffff",
    },
  });
}

export async function generateBrandedQrCanvas(text: string): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 400,
    color: { dark: h.color.ink, light: "#ffffff" },
  });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 480;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not available")); return; }

      ctx.fillStyle = h.color.surfaceWarm;
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = h.color.ink;
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, size - 40, size - 40);

      ctx.strokeStyle = h.color.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(28, 28, size - 56, size - 56);

      const qrSize = 340;
      const qrX = (size - qrSize) / 2;
      const qrY = (size - qrSize) / 2;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = h.color.ink;
      ctx.font = `700 22px ${h.font.serif}`;
      ctx.textAlign = "center";
      ctx.fillText("Litora", size / 2, size - 35);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load QR image"));
    img.src = qrDataUrl;
  });
}

export function useQrCode(text: string | null): {
  plainUrl: string | null;
  brandedUrl: string | null;
  loading: boolean;
} {
  const [plainUrl, setPlainUrl] = useState<string | null>(null);
  const [brandedUrl, setBrandedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!text);

  useEffect(() => {
    if (!text) {
      setPlainUrl(null);
      setBrandedUrl(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const plain = await QRCode.toDataURL(text, {
          errorCorrectionLevel: "H",
          margin: 2,
          width: 400,
          color: { dark: h.color.ink, light: "#ffffff" },
        });
        if (cancelled) return;
        setPlainUrl(plain);
        const branded = await generateBrandedQrCanvas(text);
        if (cancelled) return;
        setBrandedUrl(branded);
      } catch (e) {
        console.error("QR generation failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [text]);

  return { plainUrl, brandedUrl, loading };
}

export async function generatePosterDataUrl(shopName: string, brandedQrDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = 1240;
      const hh = 1754;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = hh;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not available")); return; }

      ctx.fillStyle = h.color.surfaceWarm;
      ctx.fillRect(0, 0, w, hh);

      ctx.strokeStyle = h.color.ink;
      ctx.lineWidth = 6;
      ctx.strokeRect(40, 40, w - 80, hh - 80);

      ctx.strokeStyle = h.color.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(55, 55, w - 110, hh - 110);

      ctx.strokeStyle = h.color.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(120, 200);
      ctx.lineTo(w - 120, 200);
      ctx.stroke();

      ctx.fillStyle = h.color.ink;
      ctx.font = `700 52px ${h.font.serif}`;
      ctx.textAlign = "center";
      ctx.fillText("Litora", w / 2, 150);

      ctx.fillStyle = h.color.inkMuted;
      ctx.font = `400 18px ${h.font.sans}`;
      ctx.fillText("Curated Book Marketplace", w / 2, 180);

      ctx.fillStyle = h.color.inkMuted;
      ctx.font = `400 28px ${h.font.sans}`;
      ctx.fillText("Welcome to", w / 2, 340);

      ctx.fillStyle = h.color.ink;
      ctx.font = `700 56px ${h.font.serif}`;
      ctx.textAlign = "center";
      const displayName = shopName.length > 30 ? shopName.slice(0, 30) + "..." : shopName;
      ctx.fillText(displayName, w / 2, 420);

      ctx.strokeStyle = h.color.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 60, 460);
      ctx.lineTo(w / 2 + 60, 460);
      ctx.stroke();

      ctx.fillStyle = h.color.inkSoft;
      ctx.font = `400 24px ${h.font.sans}`;
      ctx.fillText("Scan to discover our books", w / 2, 520);

      const qrDisplaySize = 560;
      const qrX = (w - qrDisplaySize) / 2;
      const qrY = 580;
      ctx.drawImage(img, qrX, qrY, qrDisplaySize, qrDisplaySize);

      ctx.fillStyle = h.color.ink;
      ctx.font = `600 22px ${h.font.sans}`;
      ctx.fillText("Use code at checkout for your discount", w / 2, hh - 220);

      ctx.strokeStyle = h.color.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(120, hh - 160);
      ctx.lineTo(w - 120, hh - 160);
      ctx.stroke();

      ctx.fillStyle = h.color.ink;
      ctx.font = `700 28px ${h.font.serif}`;
      ctx.fillText("Litora", w / 2, hh - 110);

      ctx.fillStyle = h.color.inkMuted;
      ctx.font = `400 16px ${h.font.sans}`;
      ctx.fillText("litora.app · Independent authors, hand-picked books", w / 2, hh - 80);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load QR image for poster"));
    img.src = brandedQrDataUrl;
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { try { document.body.removeChild(link); } catch {} }, 200);
}

export async function downloadBlob(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { document.body.removeChild(link); } catch {}
      URL.revokeObjectURL(blobUrl);
    }, 200);
  } catch (e) {
    console.error("downloadBlob failed, trying direct download:", e);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    try { document.body.removeChild(link); } catch {}
  }
}

async function uploadToStorage(bucket: string, path: string, dataUrl: string, contentType: string): Promise<string | null> {
  const base64 = dataUrl.split(",")[1];
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, base64ToUint8Array(base64), { contentType, upsert: true });
  if (error) return null;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function generateAndStoreSellerQr(sellerId: string, referralCode: string, shopName: string): Promise<{ plain: string; branded: string; referralUrl: string } | null> {
  const referralUrl = buildReferralUrl(referralCode);

  const plainDataUrl = await generateQrDataUrl(referralUrl);
  const brandedDataUrl = await generateBrandedQrCanvas(referralUrl);

  const plainPath = `qr-plain-${sellerId}.png`;
  const brandedPath = `qr-branded-${sellerId}.png`;

  const [plainUrl, brandedUrl] = await Promise.all([
    uploadToStorage("seller-assets", plainPath, plainDataUrl, "image/png"),
    uploadToStorage("seller-assets", brandedPath, brandedDataUrl, "image/png"),
  ]);

  if (!plainUrl || !brandedUrl) return null;

  await supabase.from("sellers").update({
    qr_code_url: plainUrl,
    qr_code_branded_url: brandedUrl,
    qr_referral_url: referralUrl,
  }).eq("id", sellerId);

  return { plain: plainUrl, branded: brandedUrl, referralUrl };
}

export async function incrementSellerViews(sellerId: string): Promise<void> {
  const { error } = await supabase.rpc("increment_seller_views", { p_seller_id: sellerId });
  if (error) {
    const { data } = await supabase.from("sellers").select("view_count").eq("id", sellerId).maybeSingle();
    const current = num(data?.view_count, 0);
    await supabase.from("sellers").update({ view_count: current + 1 }).eq("id", sellerId);
  }
}
