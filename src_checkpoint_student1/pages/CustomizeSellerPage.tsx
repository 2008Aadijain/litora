import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Loading, EmptyState, Card, Button, Input, Select, useAuth } from "../components";
import { SellerCustomizationProvider, useSellerCustomization, type SellerCustomization } from "../seller-customization";
import { useSEO } from "../seo";
import { buildReferralUrl } from "../qr-utils";

const FONT_OPTIONS = [
  { value: "", label: "Default (Inter/Fraunces)" },
  { value: "'Arial', sans-serif", label: "Arial" },
  { value: "'Georgia', serif", label: "Georgia" },
  { value: "'Courier New', monospace", label: "Courier New" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
  { value: "'Verdana', sans-serif", label: "Verdana" },
];

function CustomizeEditor({ sellerId }: { sellerId: string }) {
  const navigate = useNavigate();
  const { customization, setCustomization } = useSellerCustomization();
  const [logoUrl, setLogoUrl] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [cardBackgroundColor, setCardBackgroundColor] = useState("");
  const [fontFamily, setFontFamily] = useState("");
  const [fontColor, setFontColor] = useState("");
  const [customPosterUrl, setCustomPosterUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posterUploading, setPosterUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seller, setSeller] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("sellers").select("*").eq("id", sellerId).maybeSingle();
      setSeller(s);
      const { data: cust } = await supabase.from("seller_page_customizations").select("*").eq("seller_id", sellerId).maybeSingle();
      if (cust) {
        setLogoUrl(cust.logo_url || "");
        setBackgroundColor(cust.background_color || "");
        setAccentColor(cust.accent_color || "");
        setCardBackgroundColor(cust.card_background_color || "");
        setFontFamily(cust.font_family || "");
        setFontColor(cust.font_color || "");
        setCustomPosterUrl(cust.custom_poster_url || "");
        setCustomization({
          logoUrl: cust.logo_url || null,
          backgroundColor: cust.background_color || null,
          accentColor: cust.accent_color || null,
          cardBackgroundColor: cust.card_background_color || null,
          fontFamily: cust.font_family || null,
          fontColor: cust.font_color || null,
        });
      } else {
        setCustomization(null);
      }
    })();
  }, [sellerId]);

  const updatePreview = (vals: { logo?: string; bg?: string; accent?: string; cardBg?: string; font?: string; fontClr?: string }) => {
    const logo = vals.logo !== undefined ? vals.logo : logoUrl;
    const bg = vals.bg !== undefined ? vals.bg : backgroundColor;
    const accent = vals.accent !== undefined ? vals.accent : accentColor;
    const cardBg = vals.cardBg !== undefined ? vals.cardBg : cardBackgroundColor;
    const font = vals.font !== undefined ? vals.font : fontFamily;
    const fontClr = vals.fontClr !== undefined ? vals.fontClr : fontColor;
    setCustomization({
      logoUrl: logo || null,
      backgroundColor: bg || null,
      accentColor: accent || null,
      cardBackgroundColor: cardBg || null,
      fontFamily: font || null,
      fontColor: fontClr || null,
    });
  };

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `seller-logo-${sellerId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("seller-assets").upload(path, file, { contentType: file.type, upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("seller-assets").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      updatePreview({ logo: data.publicUrl });
    }
    setUploading(false);
  };

  const handlePosterUpload = async (file: File) => {
    setPosterUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `seller-poster-${sellerId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("seller-assets").upload(path, file, { contentType: file.type, upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("seller-assets").getPublicUrl(path);
      setCustomPosterUrl(data.publicUrl);
    }
    setPosterUploading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      seller_id: sellerId,
      logo_url: logoUrl || null,
      background_color: backgroundColor || null,
      accent_color: accentColor || null,
      card_background_color: cardBackgroundColor || null,
      font_family: fontFamily || null,
      font_color: fontColor || null,
      custom_poster_url: customPosterUrl || null,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await supabase.from("seller_page_customizations").select("id").eq("seller_id", sellerId).maybeSingle();
    if (existing) {
      await supabase.from("seller_page_customizations").update(payload).eq("seller_id", sellerId);
    } else {
      await supabase.from("seller_page_customizations").insert(payload);
    }
    setSaving(false);
    alert("Customization saved!");
  };

  const resetToDefault = () => {
    setLogoUrl(""); setBackgroundColor(""); setAccentColor("");
    setCardBackgroundColor(""); setFontFamily(""); setFontColor("");
    setCustomization(null);
  };

  const referralUrl = seller ? buildReferralUrl(seller.referral_code) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: h.space(3) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: h.space(2) }}>
        <div>
          <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "24px", color: h.color.ink, margin: 0 }}>Customize Seller Page</h2>
          <p style={{ fontSize: "14px", color: h.color.inkMuted, marginTop: 4 }}>{seller?.shop_name} — {referralUrl}</p>
        </div>
        <div style={{ display: "flex", gap: h.space(2) }}>
          <Button variant="outline" onClick={resetToDefault}>Reset to Default</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: h.space(4), flexWrap: "wrap" }}>
        <Card style={{ flex: "0 0 320px", maxWidth: 320 }}>
          <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Page Controls</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: h.space(3) }}>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Logo Image</label>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} style={{ fontSize: "14px", color: h.color.inkSoft }} disabled={uploading} />
              {uploading && <span style={{ fontSize: "13px", color: h.color.inkMuted, marginLeft: 8 }}>Uploading...</span>}
              {logoUrl && !uploading && <img src={logoUrl} alt="Seller logo for Litora QR storefront" style={{ height: 40, marginTop: 8, borderRadius: h.radius.sm }} />}
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Background Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                <input type="color" value={backgroundColor || h.color.surfaceWarm} onChange={e => { setBackgroundColor(e.target.value); updatePreview({ bg: e.target.value }); }} style={{ width: 40, height: 40, border: "none", borderRadius: h.radius.sm, cursor: "pointer" }} />
                <Input value={backgroundColor} placeholder="e.g. #faf6ef" onChange={e => { setBackgroundColor(e.target.value); updatePreview({ bg: e.target.value }); }} style={{ flex: 1 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Accent Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                <input type="color" value={accentColor || h.color.accent} onChange={e => { setAccentColor(e.target.value); updatePreview({ accent: e.target.value }); }} style={{ width: 40, height: 40, border: "none", borderRadius: h.radius.sm, cursor: "pointer" }} />
                <Input value={accentColor} placeholder="e.g. #2d6a4f" onChange={e => { setAccentColor(e.target.value); updatePreview({ accent: e.target.value }); }} style={{ flex: 1 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Book Card Background</label>
              <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                <input type="color" value={cardBackgroundColor || h.color.surface} onChange={e => { setCardBackgroundColor(e.target.value); updatePreview({ cardBg: e.target.value }); }} style={{ width: 40, height: 40, border: "none", borderRadius: h.radius.sm, cursor: "pointer" }} />
                <Input value={cardBackgroundColor} placeholder="e.g. #ffffff" onChange={e => { setCardBackgroundColor(e.target.value); updatePreview({ cardBg: e.target.value }); }} style={{ flex: 1 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Font</label>
              <Select value={fontFamily} onChange={e => { setFontFamily(e.target.value); updatePreview({ font: e.target.value }); }}>
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Font Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                <input type="color" value={fontColor || h.color.ink} onChange={e => { setFontColor(e.target.value); updatePreview({ fontClr: e.target.value }); }} style={{ width: 40, height: 40, border: "none", borderRadius: h.radius.sm, cursor: "pointer" }} />
                <Input value={fontColor} placeholder="e.g. #1a1a2e" onChange={e => { setFontColor(e.target.value); updatePreview({ fontClr: e.target.value }); }} style={{ flex: 1 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Custom Poster (for seller dashboard)</label>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handlePosterUpload(f); }} style={{ fontSize: "14px", color: h.color.inkSoft }} disabled={posterUploading} />
              {posterUploading && <span style={{ fontSize: "13px", color: h.color.inkMuted, marginLeft: 8 }}>Uploading...</span>}
              {customPosterUrl && !posterUploading && <img src={customPosterUrl} alt="Custom poster for Litora QR storefront" loading="lazy" style={{ width: 100, marginTop: 8, borderRadius: h.radius.sm }} />}
            </div>
            <Button variant="outline" size="sm" onClick={() => window.open(referralUrl || "/", "_blank")}>Open Live Page</Button>
          </div>
        </Card>

        <div style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Live Preview</h3>
          <div style={{ borderRadius: h.radius.lg, border: `2px solid ${h.color.lineSoft}`, overflow: "hidden" }}>
            <PreviewContent customization={customization} sellerName={seller?.shop_name} />
          </div>
        </div>
      </div>

      <Button variant="ghost" onClick={() => navigate("/admin")}>Back to Admin</Button>
    </div>
  );
}

function PreviewContent({ customization, sellerName }: { customization: SellerCustomization | null; sellerName?: string }) {
  const accent = customization?.accentColor || h.color.accent;
  const bg = customization?.backgroundColor || h.color.surfaceWarm;
  const cardBg = customization?.cardBackgroundColor || h.color.surface;
  const fontClr = customization?.fontColor || h.color.ink;
  const font = customization?.fontFamily || h.font.sans;
  const logo = customization?.logoUrl;
  return (
    <div style={{ background: bg, fontFamily: font, color: fontClr }}>
      <div style={{ padding: `${h.space(2)} ${h.space(2)}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: bg, borderBottom: `1px solid ${h.color.lineSoft}` }}>
        {logo ? <img src={logo} alt="Seller logo on Litora bookstore marketplace" style={{ height: 28, objectFit: "contain" }} /> : <span style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "20px", color: fontClr }}>Litora</span>}
        <span style={{ fontSize: "12px", color: h.color.inkMuted }}>Nav links</span>
      </div>
      <div style={{ padding: `${h.space(3)} ${h.space(3)}`, textAlign: "center" }}>
        <div style={{ background: h.color.ink, color: "#fff", borderRadius: h.radius.lg, padding: `${h.space(3)} ${h.space(4)}` }}>
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Welcome to</div>
          <div style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "22px" }}>{sellerName || "Seller Shop"}</div>
          <div style={{ marginTop: h.space(2), fontSize: "13px" }}>
            <span style={{ opacity: 0.8 }}>Use code </span>
            <code style={{ background: "rgba(255,255,255,0.15)", padding: "3px 10px", borderRadius: h.radius.md, fontWeight: 700 }}>SHOPCODE</code>
          </div>
        </div>
      </div>
      <div style={{ padding: `0 ${h.space(3)} ${h.space(3)}` }}>
        <div style={{ display: "flex", gap: h.space(2), padding: h.space(2), background: cardBg, borderRadius: h.radius.md, border: `1px solid ${h.color.lineSoft}` }}>
          <div style={{ width: 60, height: 80, background: h.color.surfaceAlt, borderRadius: h.radius.sm, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "14px", color: fontClr }}>Sample Book Title</div>
                <div style={{ fontSize: "12px", color: h.color.inkMuted }}>by Author</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "16px", color: accent }}>$4.99</div>
                <button style={{ background: accent, color: "#fff", border: "none", borderRadius: h.radius.md, padding: "4px 10px", fontSize: "12px", fontWeight: 600, cursor: "default", marginTop: 4 }}>Buy Now</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CustomizeSellerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useSEO({ title: "Customize Seller Page - Litora", description: "Customize seller referral page appearance.", path: "/admin/customize-seller" });

  useEffect(() => {
    if (!authLoading && !session) navigate("/admin/login");
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (authLoading || !session) return;
    (async () => {
      const { data } = await supabase.rpc("is_admin");
      setIsAdmin(!!data);
    })();
  }, [authLoading, session]);

  if (authLoading || isAdmin === null) return <Layout><Loading /></Layout>;
  if (isAdmin === false) return <Layout><EmptyState>You are not an admin.</EmptyState></Layout>;
  if (!id) return <Layout><EmptyState>No seller specified.</EmptyState></Layout>;

  return (
    <Layout>
      <SellerCustomizationProvider>
        <CustomizeEditor sellerId={id} />
      </SellerCustomizationProvider>
    </Layout>
  );
}
