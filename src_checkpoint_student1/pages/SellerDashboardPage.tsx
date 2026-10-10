import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Loading, EmptyState, Card, Button, Tab, Input, Textarea, StatCard, ProgressBar, SalesChart, num, useAuth } from "../components";
import { useSEO } from "../seo";
import { downloadDataUrl, generatePosterDataUrl, buildReferralUrl, useQrCode } from "../qr-utils";
import { downloadCSV, downloadPDFFromText, monthLabel, getMonthSales, monthTotal, buildSalesRows } from "../export-utils";

const DEFAULT_POSTER_URL = "";

export function SellerDashboardPage() {
  const { session, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [seller, setSeller] = useState<any>(null);
  const [owedData, setOwedData] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [badge, setBadge] = useState<any>(null);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [customPosterUrl, setCustomPosterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const referralUrl = seller?.referral_code ? buildReferralUrl(seller.referral_code) : null;
  const { plainUrl: qrPlain, brandedUrl: qrBranded, loading: qrLoading } = useQrCode(referralUrl);

  // Settings
  const [editForm, setEditForm] = useState({ shop_name: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  useSEO({ title: "Seller Dashboard - Litora QR Storefront", description: "Manage your Litora QR storefront, track indie bookstore revenue, and view your ebook sales and payouts.", path: "/seller/dashboard" });

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const sellerId = session.user.id;

    const [sellerRes, owedRes, salesRes, payoutsRes, notifRes, badgeRes, monthlyRes, chatRes] = await Promise.all([
      supabase.from("sellers").select("*").eq("id", sellerId).maybeSingle(),
      supabase.rpc("seller_owed_balance", { p_seller_id: sellerId }),
      supabase.from("sales").select("*").eq("seller_id", sellerId).order("sale_date", { ascending: false }),
      supabase.from("payouts").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }),
      supabase.from("seller_notifications").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }),
      supabase.from("seller_badge_progress").select("*").eq("seller_id", sellerId).maybeSingle(),
      supabase.rpc("seller_monthly_sales_count", { p_seller_id: sellerId }),
      supabase.from("chat_messages").select("*").eq("seller_id", sellerId).order("created_at", { ascending: true }),
    ]);

    setSeller(sellerRes.data);
    const owed = Array.isArray(owedRes.data) ? owedRes.data[0] : owedRes.data;
    setOwedData(owed);
    setSales(salesRes.data || []);
    setPayouts(payoutsRes.data || []);
    setNotifications(notifRes.data || []);
    setBadge(badgeRes.data);
    setMonthlyCount(Number(monthlyRes.data) || 0);
    setChatMessages(chatRes.data || []);

    const { data: cust } = await supabase.from("seller_page_customizations").select("custom_poster_url").eq("seller_id", sellerId).maybeSingle();
    setCustomPosterUrl(cust?.custom_poster_url || null);

    // Mark admin messages as read by seller
    await supabase.from("chat_messages").update({ read_by_seller: true }).eq("seller_id", sellerId).eq("sender", "admin").eq("read_by_seller", false);

    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!authLoading && !session) navigate("/seller/login");
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (authLoading || !session) return;
    (async () => {
      const { data } = await supabase.from("sellers").select("*").eq("id", session.user.id).maybeSingle();
      if (!data) { navigate("/seller/login"); return; }
      if (data.approval_status === "pending") { setSeller(data); setLoading(false); return; }
      if (data.approval_status === "rejected") { setSeller(data); setLoading(false); return; }
      loadData();
    })();
  }, [authLoading, session, navigate, loadData]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !session?.user?.id) return;
    const sellerId = session.user.id;
    const { data } = await supabase.from("chat_messages").insert({
      seller_id: sellerId, sender: "seller", message: chatInput.trim(),
      read_by_seller: true, read_by_admin: false,
    }).select("*").single();
    if (data) setChatMessages(prev => [...prev, data]);
    setChatInput("");
  };

  const markNotificationRead = async (id: string) => {
    await supabase.from("seller_notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const saveProfile = async () => {
    if (!seller) return;
    setSavingProfile(true);
    await supabase.from("sellers").update({
      shop_name: editForm.shop_name, profile_edited: true,
    }).eq("id", seller.id);
    setSeller({ ...seller, shop_name: editForm.shop_name, profile_edited: true });
    setSavingProfile(false);
  };

  const salesChartData = useMemo(() => {
    const months: { label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = sales.filter(s => {
        const sd = new Date(s.sale_date);
        return sd >= monthStart && sd < monthEnd;
      }).length;
      months.push({ label: d.toLocaleDateString("en", { month: "short" }), value: count });
    }
    return months;
  }, [sales]);

  if (authLoading || loading) return <Layout><Loading /></Layout>;
  if (!seller) return <Layout><EmptyState>No seller account found.</EmptyState></Layout>;
  if (seller.approval_status === "pending") return (
    <Layout>
      <Card style={{ textAlign: "center", padding: h.space(5), maxWidth: 500, margin: "0 auto", marginTop: h.space(4) }}>
        <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "22px", color: h.color.ink }}>Account Pending Approval</h2>
        <p style={{ fontSize: "15px", color: h.color.inkMuted, marginTop: h.space(2), lineHeight: 1.6 }}>Your seller account is being reviewed. You'll be notified once approved.</p>
        <Button variant="outline" onClick={() => signOut()} style={{ marginTop: h.space(3) }}>Sign Out</Button>
      </Card>
    </Layout>
  );
  if (seller.approval_status === "rejected") return (
    <Layout>
      <Card style={{ textAlign: "center", padding: h.space(5), maxWidth: 500, margin: "0 auto", marginTop: h.space(4) }}>
        <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "22px", color: h.color.danger }}>Account Not Approved</h2>
        <p style={{ fontSize: "15px", color: h.color.inkMuted, marginTop: h.space(2), lineHeight: 1.6 }}>Your seller application was not approved. Please contact support if you believe this is an error.</p>
        <Button variant="outline" onClick={() => signOut()} style={{ marginTop: h.space(3) }}>Sign Out</Button>
      </Card>
    </Layout>
  );

  const unreadNotifs = notifications.filter(n => !n.read);
  const unreadChat = chatMessages.filter(m => m.sender === "admin" && !m.read_by_seller).length;
  const totalCopies = num(owedData?.total_copies_sold);
  const totalEarnings = num(owedData?.total_earnings);
  const owedBalance = num(owedData?.owed_balance);
  const finalCommission = num(owedData?.final_commission_pct, num(seller.commission_pct));

  return (
    <Layout>
      <div style={{ marginTop: h.space(3), display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: h.space(2) }}>
        <div>
          <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "28px", color: h.color.ink, margin: 0, letterSpacing: "-0.02em" }}>{seller.shop_name}</h1>
          <div style={{ fontSize: "14px", color: h.color.inkMuted, marginTop: 4 }}>Referral: <code style={{ background: h.color.surfaceAlt, padding: "2px 6px", borderRadius: 4 }}>{seller.referral_code}</code></div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign Out</Button>
      </div>

      <div style={{ marginTop: h.space(3), display: "flex", borderBottom: `1px solid ${h.color.lineSoft}`, flexWrap: "wrap" }}>
        <Tab active={tab === "overview"} onClick={() => setTab("overview")}>Overview</Tab>
        <Tab active={tab === "books"} onClick={() => setTab("books")}>My Books</Tab>
        <Tab active={tab === "sales"} onClick={() => setTab("sales")}>Sales</Tab>
        <Tab active={tab === "payouts"} onClick={() => setTab("payouts")}>Payouts</Tab>
        <Tab active={tab === "messages"} onClick={() => setTab("messages")} dot={unreadChat > 0}>Messages{unreadChat > 0 ? ` (${unreadChat})` : ""}</Tab>
        <Tab active={tab === "notifications"} onClick={() => setTab("notifications")} dot={unreadNotifs.length > 0}>Notifications{unreadNotifs.length > 0 ? ` (${unreadNotifs.length})` : ""}</Tab>
        <Tab active={tab === "settings"} onClick={() => setTab("settings")}>Settings</Tab>
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(3) }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: h.space(2) }}>
            <StatCard label="Total Sales" value={totalCopies} />
            <StatCard label="Net Earnings" value={`${totalEarnings.toFixed(2)}`} />
            <StatCard label="Owed Balance" value={`${owedBalance.toFixed(2)}`} accent />
            <StatCard label="Commission Rate" value={`${finalCommission.toFixed(0)}%`} />
            <StatCard label="QR Views" value={num(seller.view_count)} />
          </div>

          {/* QR Code & Poster Section */}
          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Your QR Code & Poster</h3>
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
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Sales Over Time</h3>
            <SalesChart data={salesChartData} height={160} />
          </Card>

          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Monthly Target</h3>
            <ProgressBar value={monthlyCount} max={num(seller.monthly_target)} label={`${new Date().toLocaleDateString("en", { month: "long", year: "numeric" })} sales`} />
            {badge && (
              <div style={{ marginTop: h.space(2), fontSize: "14px", color: h.color.inkMuted }}>
                Current streak: {num(badge.current_streak)} months · Best: {num(badge.best_streak)} months
              </div>
            )}
          </Card>
        </div>
      )}

      {/* BOOKS */}
      {tab === "books" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(2) }}>
          {sales.length === 0 ? <EmptyState>No book sales yet.</EmptyState> : (
            (() => {
              const bookSalesMap: Record<string, { book: any; count: number; earnings: number }> = {};
              sales.forEach(s => {
                const key = s.book_id || "unknown";
                if (!bookSalesMap[key]) bookSalesMap[key] = { book: null, count: 0, earnings: 0 };
                bookSalesMap[key].count++;
                bookSalesMap[key].earnings += num(s.amount);
              });
              return Object.entries(bookSalesMap).map(([key, val]) => (
                <Card key={key}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: h.color.ink }}>{val.count} sales</div>
                      <div style={{ fontSize: "13px", color: h.color.inkMuted }}>${val.earnings.toFixed(2)} earned</div>
                    </div>
                  </div>
                </Card>
              ));
            })()
          )}
        </div>
      )}

      {/* SALES */}
      {tab === "sales" && (
        <div style={{ marginTop: h.space(3) }}>
          {sales.length === 0 ? <EmptyState>No sales recorded yet.</EmptyState> : (() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const ms = getMonthSales(sales, year, month);
            const total = monthTotal(ms);
            const fileBase = `${seller.shop_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${year}-${String(month + 1).padStart(2, "0")}`;
            return (
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: h.space(2) }}>
                <div style={{ fontWeight: 600, fontSize: "15px", color: h.color.ink }}>{monthLabel(year, month)} <span style={{ color: h.color.inkMuted, fontWeight: 400 }}>— ${total.toFixed(2)} sold</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" variant="outline" disabled={ms.length === 0} onClick={() => downloadCSV(`${fileBase}.csv`, buildSalesRows(ms, []))}>Download CSV</Button>
                  <Button size="sm" variant="outline" disabled={ms.length === 0} onClick={() => {
                    const rows = buildSalesRows(ms, []);
                    const lines = rows.map(r => `${r.date}  ${r.book}  ${r.amount.toFixed(2)}  ${r.status}`);
                    downloadPDFFromText(`${fileBase}.pdf`, `${seller.shop_name} - ${monthLabel(year, month)} Sales`, lines);
                  }}>Download PDF</Button>
                </div>
              </Card>
            );
          })()}
        </div>
      )}

      {/* PAYOUTS */}
      {tab === "payouts" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(2) }}>
          <Card>
            <div style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>CURRENT OWED BALANCE</div>
            <div style={{ fontSize: "28px", fontFamily: h.font.serif, fontWeight: 700, color: h.color.accent }}>${owedBalance.toFixed(2)}</div>
          </Card>
          {payouts.length === 0 ? <EmptyState>No payouts yet.</EmptyState> : payouts.map(p => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, color: h.color.ink }}>${num(p.amount).toFixed(2)}</div>
                  <div style={{ fontSize: "13px", color: h.color.inkMuted }}>{new Date(p.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: p.paid ? h.color.success : h.color.warning }}>{p.paid ? "Paid" : "Pending"}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* MESSAGES */}
      {tab === "messages" && (
        <div style={{ marginTop: h.space(3) }}>
          <Card style={{ display: "flex", flexDirection: "column", gap: h.space(2), minHeight: 400 }}>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: 0 }}>Chat with Admin</h3>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: h.space(1), overflowY: "auto", maxHeight: 400 }}>
              {chatMessages.length === 0 ? <EmptyState>No messages yet. Start a conversation with the admin team.</EmptyState> : chatMessages.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.sender === "seller" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "75%", padding: `${h.space(1)} ${h.space(2)}`, borderRadius: h.radius.md, background: m.sender === "seller" ? h.color.accent : h.color.surfaceAlt, color: m.sender === "seller" ? "#fff" : h.color.ink, fontSize: "14px", lineHeight: 1.4 }}>
                    {m.message}
                    <div style={{ fontSize: "11px", opacity: 0.7, marginTop: 2 }}>{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: h.space(2), alignItems: "center" }}>
              <Input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." onKeyDown={e => { if (e.key === "Enter") sendChatMessage(); }} />
              <Button size="sm" onClick={sendChatMessage} disabled={!chatInput.trim()}>Send</Button>
            </div>
          </Card>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {tab === "notifications" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(1) }}>
          {notifications.length === 0 ? <EmptyState>No notifications.</EmptyState> : notifications.map(n => (
            <Card key={n.id} style={{ border: n.read ? `1px solid ${h.color.lineSoft}` : `1px solid ${h.color.accent}`, padding: h.space(2) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: h.space(2) }}>
                <div>
                  <div style={{ fontWeight: n.read ? 400 : 600, color: h.color.ink, fontSize: "14px" }}>{n.message}</div>
                  {n.amount != null && <div style={{ fontSize: "13px", color: h.color.accent, fontWeight: 600, marginTop: 2 }}>${num(n.amount).toFixed(2)}</div>}
                  <div style={{ fontSize: "12px", color: h.color.inkMuted, marginTop: 2 }}>{new Date(n.created_at).toLocaleDateString()}</div>
                </div>
                {!n.read && <Button size="sm" variant="ghost" onClick={() => markNotificationRead(n.id)}>Mark read</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* SETTINGS */}
      {tab === "settings" && (
        <div style={{ marginTop: h.space(3) }}>
          <Card style={{ maxWidth: 480 }}>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>Profile Settings</h3>
            {seller.profile_edited ? (
              <div>
                <p style={{ fontSize: "14px", color: h.color.inkMuted, lineHeight: 1.6 }}>You have already edited your profile. Additional changes require contacting support.</p>
                <div style={{ marginTop: h.space(2) }}>
                  <div style={{ fontSize: "13px", color: h.color.inkMuted }}>Shop Name</div>
                  <div style={{ fontSize: "15px", color: h.color.ink, fontWeight: 600 }}>{seller.shop_name}</div>
                </div>
                <div style={{ marginTop: h.space(1) }}>
                  <div style={{ fontSize: "13px", color: h.color.inkMuted }}>Email</div>
                  <div style={{ fontSize: "15px", color: h.color.ink, fontWeight: 600 }}>{seller.email}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
                <p style={{ fontSize: "14px", color: h.color.inkMuted, lineHeight: 1.6 }}>You can edit your shop name once. Email cannot be changed here.</p>
                <div>
                  <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>Shop Name</label>
                  <Input value={editForm.shop_name || seller.shop_name} onChange={e => setEditForm({ ...editForm, shop_name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>Email (read-only)</label>
                  <Input value={seller.email} onChange={() => {}} style={{ background: h.color.surfaceAlt, cursor: "not-allowed" }} />
                </div>
                <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save Profile (one-time)"}</Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </Layout>
  );
}
