import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Loading, EmptyState, Card, Button, Tab, Input, Modal, StatCard, ProgressBar, num, useAuth } from "../components";
import { useSEO } from "../seo";

const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: `2px solid ${h.color.lineSoft}`, fontWeight: 600, color: h.color.inkMuted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" };
const tdStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${h.color.lineSoft}`, fontSize: "14px" };

type AuthorDetail = {
  owed: any;
  stats: any[];
  payouts: any[];
  breakdown: any[];
};

export function AdminAuthorsPage() {
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [authors, setAuthors] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [authorPayouts, setAuthorPayouts] = useState<any[]>([]);
  const [authorOwedBalances, setAuthorOwedBalances] = useState<Record<string, number>>({});
  const [unreadAuthorChatCounts, setUnreadAuthorChatCounts] = useState<Record<string, number>>({});

  const [tab, setTab] = useState("list");

  // Detail view
  const [detailAuthorId, setDetailAuthorId] = useState<string | null>(null);
  const [detailAuthor, setDetailAuthor] = useState<any>(null);
  const [detail, setDetail] = useState<AuthorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // New author form
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newAuthorEmail, setNewAuthorEmail] = useState("");
  const [newAuthorPassword, setNewAuthorPassword] = useState("");
  const [creatingAuthor, setCreatingAuthor] = useState(false);

  // Payouts
  const [payoutAmounts, setPayoutAmounts] = useState<Record<string, string>>({});
  const [creatingPayout, setCreatingPayout] = useState<string | null>(null);

  // Chat
  const [chatAuthorId, setChatAuthorId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  // Book picker (multi-select)
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());

  // Edit author
  const [showEditAuthor, setShowEditAuthor] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", platform_fee_pct: "7" });
  const [editSaving, setEditSaving] = useState(false);

  // Delete author (two-step confirm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Per-book author commission
  const [commEdits, setCommEdits] = useState<Record<string, string>>({});
  const [commSaving, setCommSaving] = useState<string | null>(null);

  useSEO({ title: "Author Management - Litora Admin", description: "Manage authors, assign books, and process payouts.", path: "/admin/authors" });

  useEffect(() => {
    if (authLoading || !session) return;
    (async () => {
      const { data } = await supabase.rpc("is_admin");
      setIsAdmin(!!data);
    })();
  }, [authLoading, session]);

  const loadAuthors = useCallback(async () => {
    setLoading(true);
    const [authorsRes, booksRes, payoutsRes, chatRes] = await Promise.all([
      supabase.from("authors").select("*").order("created_at", { ascending: false }),
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      supabase.from("author_payouts").select("*").order("created_at", { ascending: false }),
      supabase.rpc("admin_unread_author_chat_counts"),
    ]);
    setAuthors(authorsRes.data || []);
    setBooks(booksRes.data || []);
    setAuthorPayouts(payoutsRes.data || []);
    const chatMap: Record<string, number> = {};
    (chatRes.data || []).forEach((r: any) => { chatMap[r.author_id] = Number(r.unread_count) || 0; });
    setUnreadAuthorChatCounts(chatMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin !== true) return;
    loadAuthors();
  }, [isAdmin, loadAuthors]);

  useEffect(() => {
    if (isAdmin !== true || tab !== "payouts") return;
    (async () => {
      const balances: Record<string, number> = {};
      await Promise.all(authors.map(async a => {
        const { data } = await supabase.rpc("author_owed_balance", { p_author_id: a.id });
        const owed = Array.isArray(data) ? data[0] : data;
        balances[a.id] = num(owed?.owed_balance, 0);
      }));
      setAuthorOwedBalances(balances);
    })();
  }, [isAdmin, tab, authors]);

  const loadAuthorDetail = useCallback(async (authorId: string) => {
    setDetailLoading(true);
    const author = authors.find(a => a.id === authorId);
    setDetailAuthor(author);
    setDetailAuthorId(authorId);
    const [owedRes, statsRes, payoutsRes, breakdownRes] = await Promise.all([
      supabase.rpc("author_owed_balance", { p_author_id: authorId }),
      supabase.from("author_book_stats").select("*").eq("author_id", authorId).order("title", { ascending: true }),
      supabase.from("author_payouts").select("*").eq("author_id", authorId).order("created_at", { ascending: false }),
      supabase.from("author_book_seller_breakdown").select("*").eq("author_id", authorId).order("book_title, seller_name", { ascending: true }),
    ]);
    const owed = Array.isArray(owedRes.data) ? owedRes.data[0] : owedRes.data;
    setDetail({ owed, stats: statsRes.data || [], payouts: payoutsRes.data || [], breakdown: breakdownRes.data || [] });
    setCommEdits({});
    setEditForm({ name: author?.name || "", email: author?.email || "", platform_fee_pct: String(author?.platform_fee_pct ?? 7) });
    setDetailLoading(false);
  }, [authors]);

  useEffect(() => {
    if (!detailAuthorId) return;
    loadAuthorDetail(detailAuthorId);
  }, [detailAuthorId, loadAuthorDetail]);

  useEffect(() => {
    if (!chatAuthorId) return;
    (async () => {
      const { data } = await supabase.from("author_chat_messages").select("*").eq("author_id", chatAuthorId).order("created_at", { ascending: true });
      setChatMessages(data || []);
      await supabase.from("author_chat_messages").update({ read_by_admin: true }).eq("author_id", chatAuthorId).eq("sender", "author").eq("read_by_admin", false);
      setUnreadAuthorChatCounts(prev => ({ ...prev, [chatAuthorId]: 0 }));
    })();
  }, [chatAuthorId]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatAuthorId) return;
    setChatSending(true);
    const { data } = await supabase.from("author_chat_messages").insert({
      author_id: chatAuthorId, sender: "admin", message: chatInput.trim(),
      read_by_admin: true, read_by_author: false,
    }).select("*").single();
    if (data) setChatMessages(prev => [...prev, data]);
    setChatInput("");
    setChatSending(false);
  };

  const createAuthor = async () => {
    if (!newAuthorName || !newAuthorEmail || !newAuthorPassword) return;
    if (newAuthorPassword.length < 6) { alert("Password must be at least 6 characters."); return; }
    setCreatingAuthor(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-author`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData?.session?.access_token}` },
        body: JSON.stringify({ name: newAuthorName, email: newAuthorEmail, password: newAuthorPassword }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create author");
      setNewAuthorName(""); setNewAuthorEmail(""); setNewAuthorPassword("");
      await loadAuthors();
      setTab("list");
    } catch (e: any) {
      const msg = e?.message || "Failed to create author.";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("been taken")) {
        alert("An account with this email already exists.");
      } else {
        alert("Failed to create author: " + msg);
      }
    }
    setCreatingAuthor(false);
  };

  const createPayout = async (authorId: string) => {
    const amountStr = payoutAmounts[authorId];
    const amount = num(amountStr, 0);
    if (amount <= 0) return;
    setCreatingPayout(authorId);
    const { data: owedData } = await supabase.rpc("author_owed_balance", { p_author_id: authorId });
    const owed = Array.isArray(owedData) ? owedData[0] : owedData;
    const owedBalance = num(owed?.owed_balance, 0);
    const remaining = Math.max(0, owedBalance - amount);
    const { data } = await supabase.from("author_payouts").insert({
      author_id: authorId, amount, remaining_balance: remaining, paid: true,
    }).select("*").single();
    if (data) setAuthorPayouts(prev => [data, ...prev]);
    const dateStr = new Date().toLocaleDateString();
    await supabase.from("author_notifications").insert({
      author_id: authorId, type: "payout",
      message: `Your payment of $${amount.toFixed(2)} has been transferred on ${dateStr}.`,
      amount, read: false,
    });
    setPayoutAmounts(prev => { const n = { ...prev }; delete n[authorId]; return n; });
    setCreatingPayout(null);
    if (detailAuthorId === authorId) loadAuthorDetail(authorId);
    loadAuthors();
  };

  const assignBooks = async () => {
    if (!detailAuthorId || pickerSelected.size === 0) return;
    const rows = Array.from(pickerSelected).map(bookId => ({ author_id: detailAuthorId, book_id: bookId }));
    await supabase.from("author_books").insert(rows);
    setPickerSelected(new Set());
    setShowBookPicker(false);
    loadAuthorDetail(detailAuthorId);
  };

  const togglePickerBook = (bookId: string) => {
    setPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId); else next.add(bookId);
      return next;
    });
  };

  const unassignBook = async (bookId: string) => {
    if (!detailAuthorId) return;
    await supabase.from("author_books").delete().eq("author_id", detailAuthorId).eq("book_id", bookId);
    loadAuthorDetail(detailAuthorId);
  };

  const saveEditAuthor = async () => {
    if (!detailAuthorId || !editForm.name) return;
    setEditSaving(true);
    await supabase.from("authors").update({ name: editForm.name, email: editForm.email, platform_fee_pct: num(editForm.platform_fee_pct, 7) }).eq("id", detailAuthorId);
    setDetailAuthor((prev: any) => ({ ...prev, name: editForm.name, email: editForm.email, platform_fee_pct: num(editForm.platform_fee_pct, 7) }));
    setShowEditAuthor(false);
    setEditSaving(false);
    loadAuthors();
  };

  const resetAuthorPassword = async (email: string) => {
    await supabase.auth.resetPasswordForEmail(email);
    alert(`Password reset email sent to ${email}`);
  };

  const deleteAuthor = async () => {
    if (!detailAuthorId) return;
    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-author`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData?.session?.access_token}` },
        body: JSON.stringify({ author_id: detailAuthorId }),
      });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      await supabase.from("authors").delete().eq("id", detailAuthorId);
    }
    setDeleteConfirm(null);
    setDetailAuthorId(null);
    setDetailAuthor(null);
    setDeleting(false);
    loadAuthors();
  };

  const saveBookCommission = async (bookId: string) => {
    const val = commEdits[bookId];
    if (val === undefined) return;
    const pct = num(val, 0);
    if (pct < 0 || pct > 100) return;
    setCommSaving(bookId);
    await supabase.from("author_books").update({ commission_pct: pct }).eq("author_id", detailAuthorId).eq("book_id", bookId);
    setCommSaving(null);
    setCommEdits(prev => { const n = { ...prev }; delete n[bookId]; return n; });
    loadAuthorDetail(detailAuthorId!);
  };

  if (authLoading || loading) return <Layout><Loading /></Layout>;
  if (isAdmin === false) return <Layout><EmptyState>Admin access required.</EmptyState></Layout>;

  const assignedBookIds = new Set(detail?.stats?.map((s: any) => s.book_id) || []);
  const getBookCommission = (bookId: string) => {
    if (commEdits[bookId] !== undefined) return commEdits[bookId];
    const s = detail?.stats.find((st: any) => st.book_id === bookId);
    return s ? String(num(s.commission_pct)) : "";
  };

  // Group breakdown by book
  const breakdownByBook: Record<string, any[]> = {};
  (detail?.breakdown || []).forEach((b: any) => {
    if (!breakdownByBook[b.book_id]) breakdownByBook[b.book_id] = [];
    breakdownByBook[b.book_id].push(b);
  });

  return (
    <Layout>
      <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "28px", color: h.color.ink, margin: 0, marginTop: h.space(3), letterSpacing: "-0.02em" }}>Author Management</h1>

      {!detailAuthorId && (
        <div style={{ marginTop: h.space(3), display: "flex", borderBottom: `1px solid ${h.color.lineSoft}`, flexWrap: "wrap" }}>
          <Tab active={tab === "list"} onClick={() => setTab("list")}>Authors</Tab>
          <Tab active={tab === "payouts"} onClick={() => setTab("payouts")}>Payouts</Tab>
          <Tab active={tab === "messages"} onClick={() => setTab("messages")}>Messages</Tab>
          <Tab active={tab === "new"} onClick={() => setTab("new")}>New Author</Tab>
        </div>
      )}

      {/* ============ AUTHOR LIST TAB ============ */}
      {tab === "list" && !detailAuthorId && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(3) }}>
          {authors.length === 0 ? <EmptyState>No authors yet. Create one in the "New Author" tab.</EmptyState> : (
            <Card style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: h.font.sans }}>
                <thead><tr>
                  <th style={thStyle}>Name</th><th style={thStyle}>Email</th><th style={thStyle}>Status</th><th style={thStyle}>Actions</th>
                </tr></thead>
                <tbody>
                  {authors.map(a => (
                    <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setDetailAuthorId(a.id)}>
                      <td style={tdStyle}><span style={{ fontWeight: 600, color: h.color.ink }}>{a.name}</span></td>
                      <td style={tdStyle}>{a.email}</td>
                      <td style={tdStyle}><span style={{ fontSize: "13px", fontWeight: 600, color: a.approval_status === "approved" ? h.color.success : a.approval_status === "pending" ? h.color.warning : h.color.danger }}>{a.approval_status}</span></td>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Button size="sm" variant="ghost" onClick={() => setDetailAuthorId(a.id)}>Open</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setChatAuthorId(a.id); setTab("messages"); }}>Chat{unreadAuthorChatCounts[a.id] > 0 ? ` (${unreadAuthorChatCounts[a.id]})` : ""}</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* ============ AUTHOR DETAIL PAGE ============ */}
      {detailAuthorId && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(3) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: h.space(2) }}>
            <div>
              <Button size="sm" variant="ghost" onClick={() => { setDetailAuthorId(null); setDetailAuthor(null); }}>Back to Authors</Button>
              <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "24px", color: h.color.ink, margin: `${h.space(2)} 0 0`, letterSpacing: "-0.02em" }}>{detailAuthor?.name}</h2>
              <div style={{ fontSize: "14px", color: h.color.inkMuted }}>{detailAuthor?.email}</div>
            </div>
            <div style={{ display: "flex", gap: h.space(1), flexWrap: "wrap" }}>
              <Button size="sm" variant="outline" onClick={() => { setEditForm({ name: detailAuthor?.name || "", email: detailAuthor?.email || "", platform_fee_pct: String(detailAuthor?.platform_fee_pct ?? 7) }); setShowEditAuthor(true); }}>Edit Author</Button>
              {resetConfirm ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => { resetAuthorPassword(detailAuthor.email); setResetConfirm(false); }}>Confirm Reset</Button>
                  <Button size="sm" variant="ghost" onClick={() => setResetConfirm(false)}>Cancel</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setResetConfirm(true)}>Reset Password</Button>
              )}
              {deleteConfirm === detailAuthorId ? (
                <>
                  <Button size="sm" variant="danger" onClick={deleteAuthor} disabled={deleting}>{deleting ? "Deleting..." : "Confirm Delete"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                </>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(detailAuthorId)}>Delete Author</Button>
              )}
            </div>
          </div>

          {detailLoading ? <Loading /> : detail && (
            <>
              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: h.space(2) }}>
                <StatCard label="Total Books Sold" value={num(detail.owed?.total_copies_sold)} />
                <StatCard label="Total Earnings" value={`${num(detail.owed?.total_earnings).toFixed(2)}`} />
                <StatCard label="Owed Balance" value={`${num(detail.owed?.owed_balance).toFixed(2)}`} accent />
                <StatCard label="Paid Out" value={`${num(detail.owed?.total_payouts).toFixed(2)}`} />
                <StatCard label="Platform Fee" value={`${num(detail.owed?.platform_fee_pct, num(detailAuthor?.platform_fee_pct, 7)).toFixed(0)}%`} />
              </div>

              {/* Payout progress */}
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: h.space(2) }}>
                  <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: 0 }}>Payout Progress</h3>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: num(detail.owed?.owed_balance) >= 100 ? h.color.success : h.color.inkMuted }}>{num(detail.owed?.owed_balance) >= 100 ? "Ready for payout" : "Below threshold"}</span>
                </div>
                <ProgressBar value={num(detail.owed?.owed_balance)} max={100} label={`${num(detail.owed?.owed_balance).toFixed(2)} of $100.00`} />
              </Card>

              {/* Assigned books with per-seller breakdown */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: h.space(1) }}>
                  <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: 0 }}>Assigned Books</h3>
                  <Button size="sm" variant="outline" onClick={() => { setPickerSelected(new Set()); setShowBookPicker(true); }}>Add More Books</Button>
                </div>
                {detail.stats.length === 0 ? (
                  <Card><p style={{ fontSize: "14px", color: h.color.inkMuted, margin: 0 }}>No books assigned yet. Click "Add More Books" to assign books to this author.</p></Card>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
                    {detail.stats.map((s: any) => {
                      const sellers = breakdownByBook[s.book_id] || [];
                      return (
                        <Card key={s.book_id}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: h.space(2) }}>
                            <div>
                              <div style={{ fontWeight: 600, color: h.color.ink, fontSize: "16px" }}>{s.title}</div>
                              <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 2 }}>
                                {num(s.units_sold)} total sold · ${num(s.earnings).toFixed(2)} author earnings
                              </div>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => unassignBook(s.book_id)}>Remove Book</Button>
                          </div>

                          {/* Per-book author commission input */}
                          <div style={{ marginTop: h.space(2), display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <label style={{ fontSize: "12px", fontWeight: 600, color: h.color.accent, textTransform: "uppercase", letterSpacing: "0.04em" }}>Author Commission %</label>
                            <Input type="number" value={getBookCommission(s.book_id)} onChange={e => setCommEdits(prev => ({ ...prev, [s.book_id]: e.target.value }))} style={{ width: 90 }} />
                            <span style={{ fontSize: "13px", color: h.color.inkMuted }}>%</span>
                            <Button size="sm" variant="ghost" onClick={() => saveBookCommission(s.book_id)} disabled={commSaving === s.book_id || commEdits[s.book_id] === undefined}>{commSaving === s.book_id ? "..." : "Save"}</Button>
                          </div>

                          {/* Per-seller breakdown */}
                          <div style={{ marginTop: h.space(2) }}>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: h.color.inkMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Seller Breakdown</div>
                            {sellers.length === 0 ? (
                              <div style={{ fontSize: "13px", color: h.color.inkMuted }}>No approved sellers on the platform yet.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {sellers.map(sl => (
                                  <div key={`${s.book_id}:${sl.seller_id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: h.space(2), flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${h.color.lineSoft}` }}>
                                    <div style={{ flex: 1, minWidth: 120 }}>
                                      <div style={{ fontWeight: 600, color: h.color.ink, fontSize: "14px" }}>{sl.seller_name}</div>
                                      <div style={{ fontSize: "12px", color: h.color.inkMuted }}>{num(sl.units_sold)} units · ${num(sl.revenue).toFixed(2)} revenue</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payout history */}
              <div>
                <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(1)}` }}>Payout History</h3>
                {detail.payouts.length === 0 ? <p style={{ fontSize: "14px", color: h.color.inkMuted }}>No payouts yet.</p> : (
                  <Card style={{ padding: 0, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead><tr><th style={thStyle}>Amount</th><th style={thStyle}>Remaining</th><th style={thStyle}>Date</th><th style={thStyle}>Status</th></tr></thead>
                      <tbody>
                        {detail.payouts.map((p: any) => (
                          <tr key={p.id}>
                            <td style={tdStyle}><span style={{ fontWeight: 600 }}>${num(p.amount).toFixed(2)}</span></td>
                            <td style={tdStyle}>{num(p.remaining_balance) > 0 ? <span style={{ color: h.color.warning }}>${num(p.remaining_balance).toFixed(2)}</span> : "$0.00"}</td>
                            <td style={tdStyle}>{new Date(p.created_at).toLocaleDateString()}</td>
                            <td style={tdStyle}><span style={{ fontWeight: 600, color: p.paid ? h.color.success : h.color.warning }}>{p.paid ? "Paid" : "Pending"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>

              {/* Record payout */}
              <Card>
                <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Record Payout</h3>
                <div style={{ display: "flex", alignItems: "center", gap: h.space(2), flexWrap: "wrap" }}>
                  <Input type="number" placeholder="Amount to pay" value={payoutAmounts[detailAuthorId] || ""} onChange={e => setPayoutAmounts(prev => ({ ...prev, [detailAuthorId]: e.target.value }))} style={{ width: 140 }} />
                  <Button size="sm" onClick={() => createPayout(detailAuthorId)} disabled={creatingPayout === detailAuthorId || !payoutAmounts[detailAuthorId]}>{creatingPayout === detailAuthorId ? "..." : "Pay"}</Button>
                  <span style={{ fontSize: "13px", color: h.color.inkMuted }}>Owed: ${num(detail.owed?.owed_balance).toFixed(2)}</span>
                </div>
              </Card>

              {/* Chat shortcut */}
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: 0 }}>Messages</h3>
                  <Button size="sm" variant="outline" onClick={() => { setChatAuthorId(detailAuthorId); setTab("messages"); setDetailAuthorId(null); }}>Open Chat{unreadAuthorChatCounts[detailAuthorId] > 0 ? ` (${unreadAuthorChatCounts[detailAuthorId]})` : ""}</Button>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ============ BOOK PICKER MODAL (multi-select) ============ */}
      {showBookPicker && detailAuthorId && (
        <Modal onClose={() => setShowBookPicker(false)} title="Add More Books to Author">
          <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
            <div style={{ fontSize: "14px", color: h.color.inkMuted }}>Select one or more books to assign to {detailAuthor?.name}.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 350, overflowY: "auto" }}>
              {books.filter(b => !assignedBookIds.has(b.id)).map(b => (
                <label key={b.id} style={{ display: "flex", alignItems: "center", gap: h.space(2), padding: `${h.space(1)} ${h.space(2)}`, border: `1px solid ${h.color.lineSoft}`, borderRadius: h.radius.md, cursor: "pointer", background: pickerSelected.has(b.id) ? h.color.accentSoft : h.color.surface }}>
                  <input type="checkbox" checked={pickerSelected.has(b.id)} onChange={() => togglePickerBook(b.id)} style={{ width: 18, height: 18 }} />
                  <span style={{ flex: 1, fontSize: "14px", color: h.color.ink }}>{b.title} <span style={{ color: h.color.inkMuted, fontSize: "12px" }}>· {num(b.commission_pct).toFixed(0)}% comm · ${num(b.price).toFixed(2)}</span></span>
                </label>
              ))}
              {books.filter(b => !assignedBookIds.has(b.id)).length === 0 && <EmptyState>All books are already assigned.</EmptyState>}
            </div>
            <div style={{ display: "flex", gap: h.space(2), justifyContent: "flex-end" }}>
              <Button size="sm" variant="ghost" onClick={() => setShowBookPicker(false)}>Cancel</Button>
              <Button size="sm" onClick={assignBooks} disabled={pickerSelected.size === 0}>Assign {pickerSelected.size > 0 ? `(${pickerSelected.size})` : ""}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ EDIT AUTHOR MODAL ============ */}
      {showEditAuthor && (
        <Modal onClose={() => setShowEditAuthor(false)} title="Edit Author">
          <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
            <div><label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>NAME</label><Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>EMAIL</label><Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div><label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>PLATFORM FEE %</label><Input type="number" value={editForm.platform_fee_pct} onChange={e => setEditForm({ ...editForm, platform_fee_pct: e.target.value })} /></div>
            <div style={{ display: "flex", gap: h.space(2), justifyContent: "flex-end" }}>
              <Button size="sm" variant="ghost" onClick={() => setShowEditAuthor(false)}>Cancel</Button>
              <Button size="sm" onClick={saveEditAuthor} disabled={editSaving || !editForm.name}>{editSaving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ PAYOUTS TAB ============ */}
      {tab === "payouts" && !detailAuthorId && (
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(3), marginTop: h.space(3) }}>
          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>Ready for Payout</h3>
            <p style={{ fontSize: "14px", color: h.color.inkMuted, margin: `0 0 ${h.space(2)}` }}>Authors with $100 or more owed balance. Enter an amount to record a partial or full payout.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
              {authors.length === 0 ? <EmptyState>No authors yet.</EmptyState> : authors.map(a => {
                const owed = authorOwedBalances[a.id] || 0;
                const ready = owed >= 100;
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: h.space(2), flexWrap: "wrap", padding: `${h.space(1)} 0`, borderBottom: `1px solid ${h.color.lineSoft}` }}>
                    <div>
                      <div style={{ fontWeight: 600, color: h.color.ink, fontSize: "15px" }}>{a.name}</div>
                      <div style={{ fontSize: "13px", color: ready ? h.color.accent : h.color.inkMuted }}>Owed: ${owed.toFixed(2)}{ready ? " - Ready for payout" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                      <Input type="number" placeholder="Amount" value={payoutAmounts[a.id] || ""} onChange={e => setPayoutAmounts(prev => ({ ...prev, [a.id]: e.target.value }))} style={{ width: 100 }} />
                      <Button size="sm" onClick={() => createPayout(a.id)} disabled={creatingPayout === a.id || !payoutAmounts[a.id] || owed <= 0}>{creatingPayout === a.id ? "..." : "Pay"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDetailAuthorId(a.id)}>Details</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>All Author Payouts</h3>
            {authorPayouts.length === 0 ? <EmptyState>No author payouts yet.</EmptyState> : authorPayouts.map(p => {
              const a = authors.find(x => x.id === p.author_id);
              return (
                <Card key={p.id} style={{ marginBottom: h.space(1) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: h.space(2) }}>
                    <div>
                      <div style={{ fontWeight: 600, color: h.color.ink }}>${num(p.amount).toFixed(2)}</div>
                      <div style={{ fontSize: "13px", color: h.color.inkMuted }}>{a?.name || "Unknown"} - {new Date(p.created_at).toLocaleDateString()}</div>
                      {num(p.remaining_balance) > 0 && <div style={{ fontSize: "12px", color: h.color.warning }}>${num(p.remaining_balance).toFixed(2)} remaining</div>}
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: p.paid ? h.color.success : h.color.warning }}>{p.paid ? "Paid" : "Pending"}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ MESSAGES TAB ============ */}
      {tab === "messages" && !detailAuthorId && (
        <div style={{ display: "flex", gap: h.space(3), marginTop: h.space(3), flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 200px", maxWidth: 200 }}>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Authors</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {authors.map(a => (
                <button key={a.id} onClick={() => setChatAuthorId(a.id)} style={{ textAlign: "left", padding: `${h.space(1)} ${h.space(2)}`, border: chatAuthorId === a.id ? `1px solid ${h.color.accent}` : `1px solid ${h.color.lineSoft}`, borderRadius: h.radius.md, background: chatAuthorId === a.id ? h.color.accentSoft : h.color.surface, cursor: "pointer", fontFamily: h.font.sans, fontSize: "14px", color: h.color.ink, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{a.name}</span>
                  {unreadAuthorChatCounts[a.id] > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: h.color.danger, flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            {!chatAuthorId ? <EmptyState>Select an author to start chatting.</EmptyState> : (
              <Card style={{ display: "flex", flexDirection: "column", gap: h.space(2), minHeight: 400 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: h.space(1), overflowY: "auto", maxHeight: 400 }}>
                  {chatMessages.length === 0 ? <EmptyState>No messages yet. Start a conversation.</EmptyState> : chatMessages.map(m => (
                    <div key={m.id} style={{ display: "flex", justifyContent: m.sender === "admin" ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "75%", padding: `${h.space(1)} ${h.space(2)}`, borderRadius: h.radius.md, background: m.sender === "admin" ? h.color.accent : h.color.surfaceAlt, color: m.sender === "admin" ? "#fff" : h.color.ink, fontSize: "14px", lineHeight: 1.4 }}>
                        {m.message}
                        <div style={{ fontSize: "11px", opacity: 0.7, marginTop: 2 }}>{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: h.space(2), alignItems: "center" }}>
                  <Input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." onKeyDown={e => { if (e.key === "Enter" && !chatSending) sendChatMessage(); }} />
                  <Button size="sm" onClick={sendChatMessage} disabled={chatSending || !chatInput.trim()}>Send</Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ============ NEW AUTHOR TAB ============ */}
      {tab === "new" && !detailAuthorId && (
        <div style={{ marginTop: h.space(3), maxWidth: 480 }}>
          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>Create New Author Account</h3>
            <p style={{ fontSize: "14px", color: h.color.inkMuted, margin: `0 0 ${h.space(2)}` }}>Creates a real author login. You can assign books to this author after creation.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
              <div><label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>NAME</label><Input value={newAuthorName} onChange={e => setNewAuthorName(e.target.value)} placeholder="Author name" /></div>
              <div><label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>EMAIL</label><Input type="email" value={newAuthorEmail} onChange={e => setNewAuthorEmail(e.target.value)} placeholder="author@example.com" /></div>
              <div><label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>PASSWORD</label><Input type="password" value={newAuthorPassword} onChange={e => setNewAuthorPassword(e.target.value)} placeholder="Set a password (min 6 chars)" /></div>
              <Button onClick={createAuthor} disabled={creatingAuthor || !newAuthorName || !newAuthorEmail || !newAuthorPassword}>{creatingAuthor ? "Creating..." : "Create Author"}</Button>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
