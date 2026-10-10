import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Loading, EmptyState, Card, Button, StatCard, num, useAuth } from "../components";
import { useSEO } from "../seo";
import { downloadDataUrl, generatePosterDataUrl, buildReferralUrl, useQrCode } from "../qr-utils";

export function AdminSellerViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [seller, setSeller] = useState<any>(null);
  const [owedData, setOwedData] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [customPosterUrl, setCustomPosterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const referralUrl = seller?.referral_code ? buildReferralUrl(seller.referral_code) : null;
  const { plainUrl: qrPlain, brandedUrl: qrBranded, loading: qrLoading } = useQrCode(referralUrl);

  useSEO({ title: "Seller Dashboard View - Litora", description: "Admin view of seller dashboard.", path: "/admin/seller-view" });

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

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [sellerRes, owedRes, salesRes, payoutsRes, custRes] = await Promise.all([
      supabase.from("sellers").select("*").eq("id", id).maybeSingle(),
      supabase.rpc("seller_owed_balance", { p_seller_id: id }),
      supabase.from("sales").select("*").eq("seller_id", id).order("sale_date", { ascending: false }),
      supabase.from("payouts").select("*").eq("seller_id", id).order("created_at", { ascending: false }),
      supabase.from("seller_page_customizations").select("custom_poster_url").eq("seller_id", id).maybeSingle(),
    ]);
    setSeller(sellerRes.data);
    const owed = Array.isArray(owedRes.data) ? owedRes.data[0] : owedRes.data;
    setOwedData(owed);
    setSales(salesRes.data || []);
    setPayouts(payoutsRes.data || []);
    setCustomPosterUrl(custRes.data?.custom_poster_url || null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (isAdmin === true) loadData();
  }, [isAdmin, loadData]);

  if (authLoading || loading) return <Layout><Loading /></Layout>;
  if (isAdmin === false) return <Layout><EmptyState>You are not an admin.</EmptyState></Layout>;
  if (!seller) return <Layout><EmptyState>Seller not found. <Button variant="outline" onClick={() => navigate("/admin")}>Back to Admin</Button></EmptyState></Layout>;

  const totalCopies = num(owedData?.total_copies_sold);
  const totalEarnings = num(owedData?.total_earnings);
  const owedBalance = num(owedData?.owed_balance);
  const finalCommission = num(owedData?.final_commission_pct, num(seller.commission_pct));

  return (
    <Layout>
      <div style={{ marginTop: h.space(3), display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: h.space(2) }}>
        <div>
          <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Admin View — Seller Dashboard</div>
          <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "28px", color: h.color.ink, margin: 0, letterSpacing: "-0.02em" }}>{seller.shop_name}</h1>
          <div style={{ fontSize: "14px", color: h.color.inkMuted, marginTop: 4 }}>Email: {seller.email} · Referral: <code style={{ background: h.color.surfaceAlt, padding: "2px 6px", borderRadius: 4 }}>{seller.referral_code}</code></div>
        </div>
        <div style={{ display: "flex", gap: h.space(2) }}>
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/customize-seller/${seller.id}`)}>Customize Page</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>Back to Admin</Button>
        </div>
      </div>

      <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(3) }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: h.space(2) }}>
          <StatCard label="Total Sales" value={totalCopies} />
          <StatCard label="Net Earnings" value={`$${totalEarnings.toFixed(2)}`} />
          <StatCard label="Owed Balance" value={`$${owedBalance.toFixed(2)}`} accent />
          <StatCard label="Commission Rate" value={`${finalCommission.toFixed(0)}%`} />
          <StatCard label="QR Views" value={num(seller.view_count)} />
        </div>

        <Card>
          <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>QR Code & Poster</h3>
          {qrLoading ? (
            <div style={{ fontSize: "14px", color: h.color.inkMuted, padding: h.space(2) }}>Generating QR code...</div>
          ) : (
            <div style={{ display: "flex", gap: h.space(3), flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, marginBottom: 8 }}>PLAIN QR</div>
                {qrPlain && <img src={qrPlain} alt="Litora QR storefront plain QR code" style={{ width: 120, height: 120, borderRadius: h.radius.md }} />}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, marginBottom: 8 }}>BRANDED QR</div>
                {qrBranded && <img src={qrBranded} alt="Litora QR storefront branded QR code" style={{ width: 120, height: 120, borderRadius: h.radius.md }} />}
              </div>
              {customPosterUrl && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, marginBottom: 8 }}>CUSTOM POSTER</div>
                  <img src={customPosterUrl} alt="Custom poster for Litora QR storefront" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: h.radius.md }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: h.space(2), justifyContent: "center" }}>
                <div style={{ fontSize: "13px", color: h.color.inkMuted, wordBreak: "break-all" }}>
                  <strong>Referral link:</strong> {referralUrl}
                </div>
                <div style={{ display: "flex", gap: h.space(2), flexWrap: "wrap" }}>
                  <Button size="sm" variant="outline" disabled={!qrPlain} onClick={() => {
                    if (qrPlain) downloadDataUrl(qrPlain, `${seller.shop_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-qr.png`);
                  }}>Download QR</Button>
                  <Button size="sm" variant="outline" disabled={!qrBranded} onClick={async () => {
                    if (!qrBranded) return;
                    const poster = await generatePosterDataUrl(seller.shop_name, qrBranded);
                    downloadDataUrl(poster, `${seller.shop_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-poster.png`);
                  }}>Download Poster</Button>
                  {customPosterUrl && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const a = document.createElement("a");
                      a.href = customPosterUrl;
                      a.download = `${seller.shop_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-custom-poster.png`;
                      a.target = "_blank";
                      a.click();
                    }}>Download Custom Poster</Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Recent Sales</h3>
          {sales.length === 0 ? <EmptyState>No sales recorded.</EmptyState> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sales.slice(0, 10).map((s: any) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "4px 0", borderBottom: `1px solid ${h.color.lineSoft}` }}>
                  <span>{new Date(s.sale_date).toLocaleDateString()}</span>
                  <span style={{ color: s.refunded ? h.color.danger : h.color.ink }}>${num(s.amount).toFixed(2)}{s.refunded ? " (refunded)" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Payouts</h3>
          {payouts.length === 0 ? <EmptyState>No payouts yet.</EmptyState> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {payouts.map((p: any) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                  <span style={{ fontWeight: 600 }}>${num(p.amount).toFixed(2)}</span>
                  <span style={{ color: h.color.inkMuted }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  <span style={{ fontWeight: 600, color: p.paid ? h.color.success : h.color.warning }}>{p.paid ? "Paid" : "Pending"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
