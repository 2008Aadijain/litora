import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Loading, EmptyState, Card, Button, Tab, Input, StatCard, ProgressBar, num, useAuth, useSettings } from "../components";
import { useSEO } from "../seo";

const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: `2px solid ${h.color.lineSoft}`, fontWeight: 600, color: h.color.inkMuted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" };
const tdStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${h.color.lineSoft}`, fontSize: "14px" };

export function AuthorDashboardPage() {
  const { session, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [author, setAuthor] = useState<any>(null);
  const [owedData, setOwedData] = useState<any>(null);
  const [bookStats, setBookStats] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [formSubmitted, setFormSubmitted] = useState(false);
  const { appSettings } = useSettings();

  useSEO({ title: "Author Dashboard - Litora", description: "Track your book sales, earnings, and payouts.", path: "/author/dashboard" });

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const authorId = session.user.id;

    const [authorRes, owedRes, bookStatsRes, payoutsRes, notifRes, chatRes] = await Promise.all([
      supabase.from("authors").select("*").eq("id", authorId).maybeSingle(),
      supabase.rpc("author_owed_balance", { p_author_id: authorId }),
      supabase.from("author_book_stats").select("*").eq("author_id", authorId).order("title", { ascending: true }),
      supabase.from("author_payouts").select("*").eq("author_id", authorId).order("created_at", { ascending: false }),
      supabase.from("author_notifications").select("*").eq("author_id", authorId).order("created_at", { ascending: false }),
      supabase.from("author_chat_messages").select("*").eq("author_id", authorId).order("created_at", { ascending: true }),
    ]);

    setAuthor(authorRes.data);
    const owed = Array.isArray(owedRes.data) ? owedRes.data[0] : owedRes.data;
    setOwedData(owed);
    setBookStats(bookStatsRes.data || []);
    setPayouts(payoutsRes.data || []);
    setNotifications(notifRes.data || []);
    setChatMessages(chatRes.data || []);

    await supabase.from("author_chat_messages").update({ read_by_author: true }).eq("author_id", authorId).eq("sender", "admin").eq("read_by_author", false);

    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!authLoading && !session) navigate("/author/login");
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (authLoading || !session) return;
    (async () => {
      const { data } = await supabase.from("authors").select("*").eq("id", session.user.id).maybeSingle();
      if (!data) { navigate("/author/login"); return; }
      if (data.approval_status === "pending") { setAuthor(data); setLoading(false); return; }
      if (data.approval_status === "rejected") { setAuthor(data); setLoading(false); return; }
      loadData();
    })();
  }, [authLoading, session, navigate, loadData]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !session?.user?.id) return;
    const authorId = session.user.id;
    const { data } = await supabase.from("author_chat_messages").insert({
      author_id: authorId, sender: "author", message: chatInput.trim(),
      read_by_author: true, read_by_admin: false,
    }).select("*").single();
    if (data) setChatMessages(prev => [...prev, data]);
    setChatInput("");
  };

  const markNotificationRead = async (id: string) => {
    await supabase.from("author_notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  if (authLoading || loading) return <Layout><Loading /></Layout>;
  if (!author) return <Layout><EmptyState>No author account found.</EmptyState></Layout>;
  if (author.approval_status === "pending") return (
    <Layout>
      <Card style={{ textAlign: "center", padding: h.space(5), maxWidth: 500, margin: "0 auto", marginTop: h.space(4) }}>
        <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "22px", color: h.color.ink }}>Account Pending Approval</h2>
        <p style={{ fontSize: "15px", color: h.color.inkMuted, marginTop: h.space(2), lineHeight: 1.6 }}>Your author account is being reviewed. You'll be notified once approved.</p>
        <Button variant="outline" onClick={() => signOut()} style={{ marginTop: h.space(3) }}>Sign Out</Button>
      </Card>
    </Layout>
  );
  if (author.approval_status === "rejected") return (
    <Layout>
      <Card style={{ textAlign: "center", padding: h.space(5), maxWidth: 500, margin: "0 auto", marginTop: h.space(4) }}>
        <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "22px", color: h.color.danger }}>Account Not Approved</h2>
        <p style={{ fontSize: "15px", color: h.color.inkMuted, marginTop: h.space(2), lineHeight: 1.6 }}>Your author application was not approved. Please contact support if you believe this is an error.</p>
        <Button variant="outline" onClick={() => signOut()} style={{ marginTop: h.space(3) }}>Sign Out</Button>
      </Card>
    </Layout>
  );

  const unreadNotifs = notifications.filter(n => !n.read);
  const unreadChat = chatMessages.filter(m => m.sender === "admin" && !m.read_by_author).length;
  const totalCopies = num(owedData?.total_copies_sold);
  const totalEarnings = num(owedData?.total_earnings);
  const owedBalance = num(owedData?.owed_balance);
  const totalPayouts = num(owedData?.total_payouts);

  return (
    <Layout>
      <div style={{ marginTop: h.space(3), display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: h.space(2) }}>
        <div>
          <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "28px", color: h.color.ink, margin: 0, letterSpacing: "-0.02em" }}>{author.name}</h1>
          <div style={{ fontSize: "14px", color: h.color.inkMuted, marginTop: 4 }}>{author.email}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign Out</Button>
      </div>

      <div style={{ marginTop: h.space(3), display: "flex", borderBottom: `1px solid ${h.color.lineSoft}`, flexWrap: "wrap" }}>
        <Tab active={tab === "overview"} onClick={() => setTab("overview")}>Overview</Tab>
        <Tab active={tab === "addbook"} onClick={() => setTab("addbook")}>Add Book</Tab>
        <Tab active={tab === "books"} onClick={() => setTab("books")}>My Books</Tab>
        <Tab active={tab === "payouts"} onClick={() => setTab("payouts")}>Payouts</Tab>
        <Tab active={tab === "messages"} onClick={() => setTab("messages")} dot={unreadChat > 0}>Messages{unreadChat > 0 ? ` (${unreadChat})` : ""}</Tab>
        <Tab active={tab === "notifications"} onClick={() => setTab("notifications")} dot={unreadNotifs.length > 0}>Notifications{unreadNotifs.length > 0 ? ` (${unreadNotifs.length})` : ""}</Tab>
      </div>

      {tab === "overview" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(3) }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: h.space(2) }}>
            <StatCard label="Books Sold" value={totalCopies} />
            <StatCard label="Total Earnings" value={`$${totalEarnings.toFixed(2)}`} />
            <StatCard label="Owed Balance" value={`$${owedBalance.toFixed(2)}`} accent />
            <StatCard label="Paid Out" value={`$${totalPayouts.toFixed(2)}`} />
          </div>

          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Payout Progress</h3>
            <ProgressBar value={owedBalance} max={100} label={`${owedBalance.toFixed(2)} of $100.00 threshold`} />
            <div style={{ marginTop: h.space(2), fontSize: "14px", color: owedBalance >= 100 ? h.color.success : h.color.inkMuted }}>
              {owedBalance >= 100 ? "You've reached the payout threshold — you'll appear in the admin's Ready for Payout list." : `${(100 - owedBalance).toFixed(2)} until you qualify for payout.`}
            </div>
          </Card>

          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Book Performance</h3>
            {bookStats.length === 0 ? <p style={{ fontSize: "14px", color: h.color.inkMuted }}>No books assigned yet.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bookStats.map(bs => (
                  <div key={bs.book_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${h.space(1)} 0`, borderBottom: `1px solid ${h.color.lineSoft}` }}>
                    <div>
                      <div style={{ fontWeight: 600, color: h.color.ink, fontSize: "15px" }}>{bs.title}</div>
                      <div style={{ fontSize: "13px", color: h.color.inkMuted }}>{num(bs.units_sold)} sold · {num(bs.commission_pct).toFixed(0)}% commission</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600, color: h.color.accent, fontSize: "15px" }}>${num(bs.earnings).toFixed(2)}</div>
                      <div style={{ fontSize: "12px", color: h.color.inkMuted }}>${num(bs.revenue).toFixed(2)} revenue</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "addbook" && (
        <div style={{ marginTop: h.space(3) }}>
          {formSubmitted ? (
            <Card style={{ textAlign: "center", padding: h.space(5), maxWidth: 520 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: h.color.accentSoft, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 24, color: h.color.success, fontWeight: 700 }}>✓</span>
              </div>
              <h3 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "20px", color: h.color.ink, margin: `${h.space(2)} 0 ${h.space(1)}` }}>Thanks! Your submission was received.</h3>
              <p style={{ fontSize: "15px", color: h.color.inkMuted, lineHeight: 1.6, margin: `0 0 ${h.space(3)}` }}>You can submit another book anytime. Once approved by our team, it'll appear in your book list.</p>
              <Button variant="outline" size="sm" onClick={() => setFormSubmitted(false)}>Submit Another Book</Button>
            </Card>
          ) : (
            <Card style={{ textAlign: "center", padding: h.space(4), maxWidth: 520 }}>
              <h3 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "20px", color: h.color.ink, margin: `0 0 ${h.space(2)}` }}>Submit a New Book</h3>
              <p style={{ fontSize: "15px", color: h.color.inkSoft, marginBottom: h.space(3), lineHeight: 1.6 }}>
                Fill out the book submission form to add a new book to the marketplace. You can submit as many books as you'd like — there's no limit.
              </p>
              <Button onClick={() => { if (appSettings?.author_form_url) { window.open(appSettings.author_form_url, "_blank"); setFormSubmitted(true); } }}>Open Book Submission Form</Button>
            </Card>
          )}
        </div>
      )}

      {tab === "books" && (
        <div style={{ marginTop: h.space(3) }}>
          {bookStats.length === 0 ? <EmptyState>No books assigned to you yet.</EmptyState> : (
            <Card style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: h.font.sans }}>
                <thead><tr>
                  <th style={thStyle}>Book</th><th style={thStyle}>Units Sold</th><th style={thStyle}>Commission</th><th style={thStyle}>Revenue</th><th style={thStyle}>Earnings</th>
                </tr></thead>
                <tbody>
                  {bookStats.map(bs => (
                    <tr key={bs.book_id}>
                      <td style={tdStyle}>{bs.title}</td>
                      <td style={tdStyle}>{num(bs.units_sold)}</td>
                      <td style={tdStyle}>{num(bs.commission_pct).toFixed(0)}%</td>
                      <td style={tdStyle}>${num(bs.revenue).toFixed(2)}</td>
                      <td style={tdStyle}><span style={{ fontWeight: 600, color: h.color.accent }}>${num(bs.earnings).toFixed(2)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === "payouts" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(2) }}>
          <Card>
            <div style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>CURRENT OWED BALANCE</div>
            <div style={{ fontSize: "28px", fontFamily: h.font.serif, fontWeight: 700, color: h.color.accent }}>${owedBalance.toFixed(2)}</div>
            <div style={{ marginTop: h.space(2) }}>
              <ProgressBar value={owedBalance} max={100} label={`${owedBalance.toFixed(2)} of $100.00 threshold`} />
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>TOTAL EARNINGS (ALL TIME)</div>
            <div style={{ fontSize: "22px", fontFamily: h.font.serif, fontWeight: 700, color: h.color.ink }}>${totalEarnings.toFixed(2)}</div>
            <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 4 }}>{totalCopies} books sold across all time</div>
          </Card>
          {payouts.length === 0 ? <EmptyState>No payouts yet.</EmptyState> : payouts.map(p => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, color: h.color.ink }}>${num(p.amount).toFixed(2)} <span style={{ fontSize: "13px", fontWeight: 400, color: h.color.inkMuted }}>paid</span></div>
                  {num(p.remaining_balance) > 0 && <div style={{ fontSize: "13px", color: h.color.warning, marginTop: 2 }}>${num(p.remaining_balance).toFixed(2)} remaining</div>}
                  <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 2 }}>{new Date(p.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: p.paid ? h.color.success : h.color.warning }}>{p.paid ? "Paid" : "Pending"}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "messages" && (
        <div style={{ marginTop: h.space(3) }}>
          <Card style={{ display: "flex", flexDirection: "column", gap: h.space(2), minHeight: 400 }}>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: 0 }}>Chat with Admin</h3>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: h.space(1), overflowY: "auto", maxHeight: 400 }}>
              {chatMessages.length === 0 ? <EmptyState>No messages yet. Start a conversation with the admin team.</EmptyState> : chatMessages.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.sender === "author" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "75%", padding: `${h.space(1)} ${h.space(2)}`, borderRadius: h.radius.md, background: m.sender === "author" ? h.color.accent : h.color.surfaceAlt, color: m.sender === "author" ? "#fff" : h.color.ink, fontSize: "14px", lineHeight: 1.4 }}>
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
    </Layout>
  );
}
