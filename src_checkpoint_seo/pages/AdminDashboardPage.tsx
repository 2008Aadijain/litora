import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Loading, EmptyState, Card, Button, Tab, Input, Textarea, Select, Modal, num, useAuth } from "../components";
import { useSEO } from "../seo";
import { generatePosterDataUrl, downloadDataUrl, generateAndStoreSellerQr, useQrCode, buildReferralUrl } from "../qr-utils";
import { downloadCSV, downloadPDFFromText, monthLabel, getMonthSales, monthTotal, buildSalesRows } from "../export-utils";

const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: `2px solid ${h.color.lineSoft}`, fontWeight: 600, color: h.color.inkMuted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" };
const tdStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${h.color.lineSoft}`, fontSize: "14px" };

export function AdminDashboardPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState("sellers");
  const [sellers, setSellers] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [directSales, setDirectSales] = useState<any[]>([]);
  const [promoSettings, setPromoSettings] = useState<any>(null);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [authorRequests, setAuthorRequests] = useState<any[]>([]);
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Seller detail view
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [sellerDetail, setSellerDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Book add/edit
  const [showBookForm, setShowBookForm] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);
  const [bookForm, setBookForm] = useState({ title: "", author: "", description: "", price: "", gumroad_url: "", cover_image_url: "", sample_pdf_url: "", sample_text: "", commission_pct: "30", gumroad_permalink: "", category: "" });
  const [bookSaving, setBookSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);

  // Manual sale
  const [manualSale, setManualSale] = useState({ sellerId: "", bookId: "", amount: "" });
  const [addingSale, setAddingSale] = useState(false);

  // Payout
  const [payoutAmounts, setPayoutAmounts] = useState<Record<string, string>>({});
  const [creatingPayout, setCreatingPayout] = useState<string | null>(null);
  const [sellerOwedBalances, setSellerOwedBalances] = useState<Record<string, number>>({});
  const [sellerCommissionRates, setSellerCommissionRates] = useState<Record<string, number>>({});

  // Chat
  const [chatSellerId, setChatSellerId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const adminQrUrl = selectedSeller?.referral_code ? buildReferralUrl(selectedSeller.referral_code) : null;
  const { plainUrl: adminQrPlain, brandedUrl: adminQrBranded, loading: adminQrLoading } = useQrCode(adminQrUrl);

  // Seller edit fields (admin-only)
  const [sellerEdit, setSellerEdit] = useState<any>(null);
  const [sellerEditSaving, setSellerEditSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Seller book assignment
  const [sellerBookIds, setSellerBookIds] = useState<Set<string>>(new Set());
  const [bookAssignSaving, setBookAssignSaving] = useState(false);

  // Month picker for admin sales download
  const [pickerMonth, setPickerMonth] = useState("");

  // Events
  const [events, setEvents] = useState<any[]>([]);
  const [eventRequests, setEventRequests] = useState<any[]>([]);
  const [eventForm, setEventForm] = useState({ title: "", description: "", image_url: "", youtube_url: "", video_description: "", join_form_url: "" });
  const [eventSaving, setEventSaving] = useState(false);
  const [eventImageUploading, setEventImageUploading] = useState(false);
  const [eventsTab, setEventsTab] = useState("list");

  useSEO({ title: "Admin Dashboard - Litora", description: "Manage sellers, books, and payouts on Litora.", path: "/admin" });

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

  useEffect(() => {
    if (isAdmin !== true) return;
    (async () => {
      setLoading(true);
      const [sellersRes, booksRes, payoutsRes, directSalesRes, promoRes, appRes, authorRes, chatRes, eventsRes, eventReqRes] = await Promise.all([
        supabase.from("sellers").select("*").order("created_at", { ascending: false }),
        supabase.from("books").select("*").order("created_at", { ascending: false }),
        supabase.from("payouts").select("*").order("created_at", { ascending: false }),
        supabase.from("sales").select("*").eq("is_direct_sale", true).order("sale_date", { ascending: false }),
        supabase.from("promo_banner_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("author_requests").select("*").order("created_at", { ascending: false }),
        supabase.rpc("admin_unread_chat_counts"),
        supabase.from("events").select("*").order("created_at", { ascending: false }),
        supabase.from("event_requests").select("*").order("created_at", { ascending: false }),
      ]);
      setSellers(sellersRes.data || []);
      setBooks(booksRes.data || []);
      setPayouts(payoutsRes.data || []);
      setDirectSales(directSalesRes.data || []);
      setPromoSettings(promoRes.data);
      setAppSettings(appRes.data);
      setAuthorRequests(authorRes.data || []);
      setEvents(eventsRes.data || []);
      setEventRequests(eventReqRes.data || []);
      const chatMap: Record<string, number> = {};
      (chatRes.data || []).forEach((r: any) => { chatMap[r.seller_id] = Number(r.unread_count) || 0; });
      setUnreadChatCounts(chatMap);
      setLoading(false);
    })();
  }, [isAdmin]);

  // Fetch owed balances for payout tab
  useEffect(() => {
    if (isAdmin !== true || tab !== "payouts") return;
    (async () => {
      const balances: Record<string, number> = {};
      await Promise.all(sellers.filter(s => s.approval_status === "approved").map(async s => {
        const { data } = await supabase.rpc("seller_owed_balance", { p_seller_id: s.id });
        const owed = Array.isArray(data) ? data[0] : data;
        balances[s.id] = num(owed?.owed_balance, 0);
      }));
      setSellerOwedBalances(balances);
    })();
  }, [isAdmin, tab, sellers]);

  // Fetch running commission rates for sellers tab
  useEffect(() => {
    if (isAdmin !== true || tab !== "sellers") return;
    (async () => {
      const rates: Record<string, number> = {};
      await Promise.all(sellers.map(async s => {
        const { data } = await supabase.rpc("seller_owed_balance", { p_seller_id: s.id });
        const owed = Array.isArray(data) ? data[0] : data;
        rates[s.id] = num(owed?.final_commission_pct, num(s.commission_pct));
      }));
      setSellerCommissionRates(rates);
    })();
  }, [isAdmin, tab, sellers]);

  // Load seller detail
  const loadSellerDetail = async (sellerId: string) => {
    setDetailLoading(true);
    const seller = sellers.find(s => s.id === sellerId);
    setSelectedSeller(seller);
    setSellerEdit(seller ? { referral_code: seller.referral_code || "", offer_code: seller.offer_code || "", commission_pct: String(seller.commission_pct ?? 10), monthly_target: String(seller.monthly_target ?? 10), bonus_margin_pct: String(seller.bonus_margin_pct ?? 0), penalty_margin_pct: String(seller.penalty_margin_pct ?? 0), approval_status: seller.approval_status || "pending", seller_promo_pct: String(seller.seller_promo_pct ?? 0), seller_promo_message: seller.seller_promo_message || "", platform_fee_pct: String(seller.platform_fee_pct ?? 7) } : null);
    const [owedRes, salesRes, payoutsRes, badgeRes, monthlyRes, sbRes] = await Promise.all([
      supabase.rpc("seller_owed_balance", { p_seller_id: sellerId }),
      supabase.from("sales").select("*").eq("seller_id", sellerId).order("sale_date", { ascending: false }),
      supabase.from("payouts").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }),
      supabase.from("seller_badge_progress").select("*").eq("seller_id", sellerId).maybeSingle(),
      supabase.rpc("seller_monthly_sales_count", { p_seller_id: sellerId }),
      supabase.from("seller_books").select("book_id").eq("seller_id", sellerId),
    ]);
    const owedData = Array.isArray(owedRes.data) ? owedRes.data[0] : owedRes.data;
    setSellerDetail({
      owed: owedData,
      sales: salesRes.data || [],
      payouts: payoutsRes.data || [],
      badge: badgeRes.data || null,
      monthlyCount: Number(monthlyRes.data) || 0,
    });
    setSellerBookIds(new Set((sbRes.data || []).map((r: any) => r.book_id)));
    setPickerMonth("");
    setDetailLoading(false);
  };

  // Load chat messages
  useEffect(() => {
    if (!chatSellerId) return;
    (async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("seller_id", chatSellerId).order("created_at", { ascending: true });
      setChatMessages(data || []);
      await supabase.from("chat_messages").update({ read_by_admin: true }).eq("seller_id", chatSellerId).eq("sender", "seller").eq("read_by_admin", false);
      setUnreadChatCounts(prev => ({ ...prev, [chatSellerId]: 0 }));
    })();
  }, [chatSellerId]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatSellerId) return;
    setChatSending(true);
    const { data } = await supabase.from("chat_messages").insert({
      seller_id: chatSellerId, sender: "admin", message: chatInput.trim(),
      read_by_admin: true, read_by_seller: false,
    }).select("*").single();
    if (data) setChatMessages(prev => [...prev, data]);
    setChatInput("");
    setChatSending(false);
  };

  if (authLoading || loading) return <Layout><Loading /></Layout>;
  if (isAdmin === false) return <Layout><EmptyState>You are not an admin. <Button variant="outline" onClick={() => navigate("/admin/login")}>Admin Login</Button></EmptyState></Layout>;

  const pendingSellers = sellers.filter(s => s.approval_status === "pending");
  const newAuthorRequests = authorRequests.filter(r => !r.viewed_by_admin);

  const approveSeller = async (id: string) => {
    await supabase.from("sellers").update({ approval_status: "approved" }).eq("id", id);
    setSellers(prev => prev.map(s => s.id === id ? { ...s, approval_status: "approved" } : s));
    const seller = sellers.find(s => s.id === id);
    if (seller && seller.referral_code) {
      try {
        await generateAndStoreSellerQr(id, seller.referral_code, seller.shop_name);
      } catch (e) { console.error("QR generation failed:", e); }
    }
  };

  const rejectSeller = async (id: string) => {
    await supabase.from("sellers").update({ approval_status: "rejected" }).eq("id", id);
    setSellers(prev => prev.map(s => s.id === id ? { ...s, approval_status: "rejected" } : s));
  };

  const deleteSeller = async (id: string) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-seller`;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ seller_id: id }),
      });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      await supabase.from("sellers").delete().eq("id", id);
    }
    setSellers(prev => prev.filter(s => s.id !== id));
    setDeleteConfirm(null);
    setSelectedSeller(null);
  };

  const resetSellerPassword = async (email: string) => {
    await supabase.auth.resetPasswordForEmail(email);
    alert(`Password reset email sent to ${email}`);
  };

  const saveSellerEdit = async () => {
    if (!selectedSeller || !sellerEdit) return;
    setSellerEditSaving(true);
    const { error } = await supabase.from("sellers").update({
      referral_code: sellerEdit.referral_code,
      offer_code: sellerEdit.offer_code || null,
      commission_pct: num(sellerEdit.commission_pct, 10),
      monthly_target: num(sellerEdit.monthly_target, 10),
      bonus_margin_pct: num(sellerEdit.bonus_margin_pct, 0),
      penalty_margin_pct: num(sellerEdit.penalty_margin_pct, 0),
      approval_status: sellerEdit.approval_status,
      seller_promo_pct: num(sellerEdit.seller_promo_pct, 0),
      seller_promo_message: sellerEdit.seller_promo_message || null,
      platform_fee_pct: num(sellerEdit.platform_fee_pct, 7),
    }).eq("id", selectedSeller.id);
    if (!error) {
      const updated = { ...selectedSeller, ...sellerEdit, commission_pct: num(sellerEdit.commission_pct, 10), monthly_target: num(sellerEdit.monthly_target, 10), bonus_margin_pct: num(sellerEdit.bonus_margin_pct, 0), penalty_margin_pct: num(sellerEdit.penalty_margin_pct, 0), platform_fee_pct: num(sellerEdit.platform_fee_pct, 7) };
      setSelectedSeller(updated);
      setSellers(prev => prev.map(s => s.id === selectedSeller.id ? updated : s));
    }
    setSellerEditSaving(false);
  };

  const uploadCoverImage = async (file: File) => {
    setCoverUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `cover-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("book-covers").upload(path, file, { contentType: file.type, upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("book-covers").getPublicUrl(path);
      setBookForm(prev => ({ ...prev, cover_image_url: data.publicUrl }));
    }
    setCoverUploading(false);
  };

  const uploadSamplePdf = async (file: File) => {
    setPdfUploading(true);
    const rawPath = `raw-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from("sample-pdfs").upload(rawPath, file, { contentType: "application/pdf", upsert: true });
    if (upErr) { alert("Failed to upload sample PDF. Please try again."); setPdfUploading(false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/watermark-pdf`;
    try {
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ path: rawPath }),
      });
      if (!res.ok) throw new Error("Watermarking failed");
      const { publicUrl } = await res.json();
      if (publicUrl) setBookForm(prev => ({ ...prev, sample_pdf_url: publicUrl }));
    } catch { /* watermark failed — keep raw PDF as fallback */ const { data } = supabase.storage.from("sample-pdfs").getPublicUrl(rawPath); setBookForm(prev => ({ ...prev, sample_pdf_url: data.publicUrl })); }
    setPdfUploading(false);
  };

  const saveBook = async () => {
    setBookSaving(true);
    const bookData = {
      title: bookForm.title, author: bookForm.author, description: bookForm.description,
      price: num(bookForm.price), gumroad_url: bookForm.gumroad_url, cover_image_url: bookForm.cover_image_url,
      sample_pdf_url: bookForm.sample_pdf_url || null,
      sample_text: bookForm.sample_text, commission_pct: num(bookForm.commission_pct), gumroad_permalink: bookForm.gumroad_permalink || null,
      category: bookForm.category || null,
    };
    if (editingBook) {
      const { data, error } = await supabase.from("books").update(bookData).eq("id", editingBook.id).select("*").maybeSingle();
      if (error) { alert(`Failed to update book: ${error.message}`); setBookSaving(false); return; }
      if (data) setBooks(prev => prev.map(b => b.id === editingBook.id ? data : b));
    } else {
      const { data, error } = await supabase.from("books").insert(bookData).select("*").maybeSingle();
      if (error) { alert(`Failed to add book: ${error.message}`); setBookSaving(false); return; }
      if (data) setBooks(prev => [data, ...prev]);
      else { alert("Failed to add book — no row returned. Check admin permissions."); setBookSaving(false); return; }
    }
    setBookForm({ title: "", author: "", description: "", price: "", gumroad_url: "", cover_image_url: "", sample_pdf_url: "", sample_text: "", commission_pct: "30", gumroad_permalink: "", category: "" });
    setEditingBook(null);
    setShowBookForm(false);
    setBookSaving(false);
  };

  const deleteBook = async (id: string) => {
    if (!confirm("Delete this book?")) return;
    await supabase.from("books").delete().eq("id", id);
    setBooks(prev => prev.filter(b => b.id !== id));
  };

  const createPayout = async (sellerId: string) => {
    const amountStr = payoutAmounts[sellerId];
    const amount = num(amountStr, 0);
    if (amount <= 0) return;
    setCreatingPayout(sellerId);
    const { data: owedData } = await supabase.rpc("seller_owed_balance", { p_seller_id: sellerId });
    const owed = Array.isArray(owedData) ? owedData[0] : owedData;
    const owedBalance = num(owed?.owed_balance, 0);
    const remaining = Math.max(0, owedBalance - amount);
    const { data } = await supabase.from("payouts").insert({
      seller_id: sellerId, amount, remaining_balance: remaining, paid: true,
    }).select("*").single();
    if (data) setPayouts(prev => [data, ...prev]);
    const dateStr = new Date().toLocaleDateString();
    await supabase.from("seller_notifications").insert({
      seller_id: sellerId, type: "payout",
      message: `Your payment of $${amount.toFixed(2)} has been transferred on ${dateStr}.`,
      amount, read: false,
    });
    setPayoutAmounts(prev => { const n = { ...prev }; delete n[sellerId]; return n; });
    setCreatingPayout(null);
    if (selectedSeller?.id === sellerId) loadSellerDetail(sellerId);
  };

  const addManualSale = async () => {
    setAddingSale(true);
    await supabase.from("sales").insert({
      seller_id: manualSale.sellerId, book_id: manualSale.bookId,
      amount: num(manualSale.amount), sale_date: new Date().toISOString().slice(0, 10),
    });
    setManualSale({ sellerId: "", bookId: "", amount: "" });
    setAddingSale(false);
  };

  const markAuthorRequestViewed = async (id: string) => {
    await supabase.from("author_requests").update({ viewed_by_admin: true }).eq("id", id);
    setAuthorRequests(prev => prev.map(r => r.id === id ? { ...r, viewed_by_admin: true } : r));
  };

  const savePromoSettings = async () => {
    if (!promoSettings) return;
    await supabase.from("promo_banner_settings").update({
      promo_enabled: promoSettings.promo_enabled, headline: promoSettings.headline,
      subtext: promoSettings.subtext, discount_pct: num(promoSettings.discount_pct),
    }).eq("id", 1);
  };

  const saveAppSettings = async () => {
    if (!appSettings) return;
    await supabase.from("app_settings").update({ author_form_url: appSettings.author_form_url, contact_email: appSettings.contact_email }).eq("id", 1);
  };

  const toggleSellerBook = (bookId: string) => {
    setSellerBookIds(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId); else next.add(bookId);
      return next;
    });
  };

  const saveSellerBooks = async () => {
    if (!selectedSeller) return;
    setBookAssignSaving(true);
    await supabase.from("seller_books").delete().eq("seller_id", selectedSeller.id);
    const rows = Array.from(sellerBookIds).map(bookId => ({ seller_id: selectedSeller.id, book_id: bookId }));
    if (rows.length > 0) await supabase.from("seller_books").insert(rows);
    setBookAssignSaving(false);
  };

  const selectAllSellerBooks = () => setSellerBookIds(new Set(books.map(b => b.id)));

  const downloadMonthFile = (sellerName: string, sales: any[], year: number, month: number, format: "csv" | "pdf") => {
    const ms = getMonthSales(sales, year, month);
    const rows = buildSalesRows(ms, books);
    const label = monthLabel(year, month);
    const fileBase = `${sellerName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${year}-${String(month + 1).padStart(2, "0")}`;
    if (format === "csv") {
      downloadCSV(`${fileBase}.csv`, rows);
    } else {
      const lines = rows.map(r => `${r.date}  ${r.book}  ${r.amount.toFixed(2)}  ${r.status}`);
      downloadPDFFromText(`${fileBase}.pdf`, `${sellerName} - ${label} Sales`, lines);
    }
  };

  const monthOptions = (createdAt: string) => {
    const opts: { value: string; label: string }[] = [];
    const start = new Date(createdAt);
    const now = new Date();
    let y = start.getFullYear(), m = start.getMonth();
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      opts.push({ value: `${y}-${m}`, label: monthLabel(y, m) });
      m++; if (m > 11) { m = 0; y++; }
    }
    return opts;
  };

  const uploadEventImage = async (file: File) => {
    setEventImageUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `event-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("event-images").upload(path, file, { contentType: file.type, upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("event-images").getPublicUrl(path);
      setEventForm(prev => ({ ...prev, image_url: data.publicUrl }));
    }
    setEventImageUploading(false);
  };

  const saveEvent = async () => {
    setEventSaving(true);
    const data = { title: eventForm.title, description: eventForm.description, image_url: eventForm.image_url || null, youtube_url: eventForm.youtube_url || null, video_description: eventForm.video_description, join_form_url: eventForm.join_form_url || null };
    const { data: result, error } = await supabase.from("events").insert(data).select("*").maybeSingle();
    if (error) { alert(`Failed to create event: ${error.message}`); setEventSaving(false); return; }
    if (result) setEvents(prev => [result, ...prev]);
    setEventForm({ title: "", description: "", image_url: "", youtube_url: "", video_description: "", join_form_url: "" });
    setEventSaving(false);
  };

  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    await supabase.from("events").delete().eq("id", id);
    setEvents(prev => prev.filter(e => e.id !== id));
    setEventRequests(prev => prev.filter(r => r.event_id !== id));
  };

  const approveEventRequest = async (id: string) => {
    await supabase.from("event_requests").update({ status: "approved" }).eq("id", id);
    setEventRequests(prev => prev.map(r => r.id === id ? { ...r, status: "approved" } : r));
  };

  const rejectEventRequest = async (id: string) => {
    await supabase.from("event_requests").delete().eq("id", id);
    setEventRequests(prev => prev.filter(r => r.id !== id));
  };

  const toggleBookVisibility = async (bookId: string, field: "show_reviews" | "show_sales_count") => {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    const newVal = !(book[field] !== false);
    await supabase.from("books").update({ [field]: newVal }).eq("id", bookId);
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, [field]: newVal } : b));
  };

  const pendingEventRequests = eventRequests.filter(r => r.status === "pending");
  const totalUnreadChat = Object.values(unreadChatCounts).reduce((a, b) => a + b, 0);

  return (
    <Layout>
      <div style={{ marginTop: h.space(4), display: "flex", borderBottom: `1px solid ${h.color.lineSoft}`, flexWrap: "wrap" }}>
        <Tab active={tab === "sellers"} onClick={() => setTab("sellers")} dot={pendingSellers.length > 0}>Sellers</Tab>
        <Tab active={tab === "books"} onClick={() => setTab("books")}>Books</Tab>
        <Tab active={tab === "sales"} onClick={() => setTab("sales")}>Manual Sale</Tab>
        <Tab active={tab === "payouts"} onClick={() => setTab("payouts")}>Payouts</Tab>
        <Tab active={tab === "messages"} onClick={() => setTab("messages")} dot={totalUnreadChat > 0}>Messages{totalUnreadChat > 0 ? ` (${totalUnreadChat})` : ""}</Tab>
        <Tab active={tab === "promo"} onClick={() => setTab("promo")}>Promo</Tab>
        <Tab active={tab === "authors"} onClick={() => setTab("authors")} dot={newAuthorRequests.length > 0}>Author Requests</Tab>
        <Tab active={tab === "events"} onClick={() => setTab("events")} dot={pendingEventRequests.length > 0}>Events{pendingEventRequests.length > 0 ? ` (${pendingEventRequests.length})` : ""}</Tab>
      </div>

      {/* SELLERS TAB */}
      {tab === "sellers" && (
        <div style={{ marginTop: h.space(3) }}>
          {sellers.length === 0 ? <EmptyState>No sellers yet.</EmptyState> : (
            <Card style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: h.font.sans }}>
                <thead><tr>
                  <th style={thStyle}>Shop Name</th><th style={thStyle}>Email</th><th style={thStyle}>Referral Code</th>
                  <th style={thStyle}>Coupon Code</th><th style={thStyle}>Base Comm.</th><th style={thStyle}>Running Comm.</th><th style={thStyle}>Status</th><th style={thStyle}>Actions</th>
                </tr></thead>
                <tbody>
                  {sellers.map(s => (
                    <tr key={s.id}>
                      <td style={tdStyle}>{s.shop_name}</td>
                      <td style={tdStyle}>{s.email}</td>
                      <td style={tdStyle}><code style={{ background: h.color.surfaceAlt, padding: "2px 6px", borderRadius: 4, fontSize: "13px" }}>{s.referral_code}</code></td>
                      <td style={tdStyle}><code style={{ background: h.color.surfaceAlt, padding: "2px 6px", borderRadius: 4, fontSize: "13px" }}>{s.offer_code || "-"}</code></td>
                      <td style={tdStyle}>{num(s.commission_pct).toFixed(0)}%</td>
                      <td style={tdStyle}>{sellerCommissionRates[s.id] != null ? `${sellerCommissionRates[s.id].toFixed(0)}%` : "-"}</td>
                      <td style={tdStyle}><span style={{ fontSize: "13px", fontWeight: 600, color: s.approval_status === "approved" ? h.color.success : s.approval_status === "pending" ? h.color.warning : h.color.danger }}>{s.approval_status}</span></td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {s.approval_status === "pending" && (<><Button size="sm" onClick={() => approveSeller(s.id)}>Approve</Button><Button size="sm" variant="outline" onClick={() => rejectSeller(s.id)}>Reject</Button></>)}
                          <Button size="sm" variant="ghost" onClick={() => loadSellerDetail(s.id)}>View Details</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setChatSellerId(s.id); setTab("messages"); }}>Chat{unreadChatCounts[s.id] > 0 ? ` (${unreadChatCounts[s.id]})` : ""}</Button>
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

      {/* SELLER DETAIL MODAL */}
      {selectedSeller && (
        <Modal onClose={() => { setSelectedSeller(null); setSellerDetail(null); }} title={`Seller Details: ${selectedSeller.shop_name}`}>
          {detailLoading ? <Loading /> : sellerDetail ? (
            <div style={{ display: "flex", flexDirection: "column", gap: h.space(3) }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: h.space(2) }}>
                <div><span style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>EMAIL</span><div style={{ fontSize: "15px", color: h.color.ink }}>{selectedSeller.email}</div></div>
                <div><span style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>OWED BALANCE</span><div style={{ fontSize: "15px", color: h.color.accent, fontWeight: 600 }}>${num(sellerDetail.owed?.owed_balance).toFixed(2)}</div></div>
                <div><span style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>TOTAL SALES</span><div style={{ fontSize: "15px", color: h.color.ink }}>{num(sellerDetail.owed?.total_copies_sold)} copies</div></div>
                <div><span style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>MONTHLY SALES</span><div style={{ fontSize: "15px", color: h.color.ink }}>{sellerDetail.monthlyCount} / {num(selectedSeller.monthly_target)}</div></div>
                <div><span style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>RUNNING COMMISSION</span><div style={{ fontSize: "15px", color: h.color.ink, fontWeight: 600 }}>{num(sellerDetail.owed?.final_commission_pct, num(selectedSeller.commission_pct)).toFixed(0)}%</div></div>
                <div><span style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>PLATFORM FEE</span><div style={{ fontSize: "15px", color: h.color.ink, fontWeight: 600 }}>{num(sellerDetail.owed?.platform_fee_pct, num(selectedSeller.platform_fee_pct, 7)).toFixed(0)}%</div></div>
                <div><span style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>NET EARNINGS</span><div style={{ fontSize: "15px", color: h.color.ink, fontWeight: 600 }}>${num(sellerDetail.owed?.total_earnings).toFixed(2)}</div></div>
              </div>

              {/* Admin-editable seller settings */}
              <Card>
                <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Seller Settings (Admin Only)</h3>
                {sellerEdit && (
                  <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: h.space(2) }}>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>REFERRAL CODE</label><Input value={sellerEdit.referral_code} onChange={e => setSellerEdit({ ...sellerEdit, referral_code: e.target.value })} /></div>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>COUPON CODE</label><Input value={sellerEdit.offer_code} onChange={e => setSellerEdit({ ...sellerEdit, offer_code: e.target.value })} placeholder="Optional" /></div>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>COMMISSION %</label><Input type="number" value={sellerEdit.commission_pct} onChange={e => setSellerEdit({ ...sellerEdit, commission_pct: e.target.value })} /></div>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>MONTHLY TARGET</label><Input type="number" value={sellerEdit.monthly_target} onChange={e => setSellerEdit({ ...sellerEdit, monthly_target: e.target.value })} /></div>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>BONUS MARGIN %</label><Input type="number" value={sellerEdit.bonus_margin_pct} onChange={e => setSellerEdit({ ...sellerEdit, bonus_margin_pct: e.target.value })} /></div>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>PENALTY MARGIN %</label><Input type="number" value={sellerEdit.penalty_margin_pct} onChange={e => setSellerEdit({ ...sellerEdit, penalty_margin_pct: e.target.value })} /></div>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>PLATFORM FEE %</label><Input type="number" value={sellerEdit.platform_fee_pct} onChange={e => setSellerEdit({ ...sellerEdit, platform_fee_pct: e.target.value })} /></div>
                      <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>SELLER PROMO DISCOUNT %</label><Input type="number" value={sellerEdit.seller_promo_pct} onChange={e => setSellerEdit({ ...sellerEdit, seller_promo_pct: e.target.value })} placeholder="0" /></div>
                    </div>
                    <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>SELLER PROMO MESSAGE (shown on welcome banner)</label><Input value={sellerEdit.seller_promo_message} onChange={e => setSellerEdit({ ...sellerEdit, seller_promo_message: e.target.value })} placeholder="e.g. Special offer just for you!" /></div>
                    <div><label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>APPROVAL STATUS</label><Select value={sellerEdit.approval_status} onChange={e => setSellerEdit({ ...sellerEdit, approval_status: e.target.value })}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select></div>
                    <Button size="sm" onClick={saveSellerEdit} disabled={sellerEditSaving}>{sellerEditSaving ? "Saving..." : "Save Seller Settings"}</Button>
                  </div>
                )}
              </Card>

              {/* QR Codes & Poster */}
              <Card>
                <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>QR Code & Poster</h3>
                {adminQrLoading ? (
                  <div style={{ fontSize: "14px", color: h.color.inkMuted, padding: h.space(2) }}>Generating QR code...</div>
                ) : (
                  <div style={{ display: "flex", gap: h.space(3), flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, marginBottom: 8 }}>PLAIN QR</div>
                      {adminQrPlain && <img src={adminQrPlain} alt="Plain QR" style={{ width: 120, height: 120, borderRadius: h.radius.md }} />}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, marginBottom: 8 }}>BRANDED QR</div>
                      {adminQrBranded && <img src={adminQrBranded} alt="Branded QR" style={{ width: 120, height: 120, borderRadius: h.radius.md }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: h.space(2), justifyContent: "center" }}>
                      <div style={{ fontSize: "13px", color: h.color.inkMuted, wordBreak: "break-all" }}>
                        <strong>Referral link:</strong> {adminQrUrl || `?ref=${selectedSeller.referral_code}`}
                      </div>
                      <div style={{ fontSize: "13px", color: h.color.inkMuted }}>
                        <strong>Views:</strong> {num(selectedSeller.view_count)}
                      </div>
                      <div style={{ display: "flex", gap: h.space(2), flexWrap: "wrap" }}>
                        <Button size="sm" variant="outline" disabled={!adminQrPlain} onClick={() => {
                          if (adminQrPlain) downloadDataUrl(adminQrPlain, `${selectedSeller.shop_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-qr.png`);
                        }}>Download QR</Button>
                        <Button size="sm" variant="outline" disabled={!adminQrBranded} onClick={async () => {
                          if (!adminQrBranded) return;
                          const poster = await generatePosterDataUrl(selectedSeller.shop_name, adminQrBranded);
                          downloadDataUrl(poster, `${selectedSeller.shop_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-poster.png`);
                        }}>Download Poster</Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* Monthly Sales Cards */}
              <div>
                <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(1)}` }}>Monthly Sales</h3>
                {(() => {
                  const now = new Date();
                  const months: { year: number; month: number }[] = [];
                  for (let i = 0; i < 2; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    months.push({ year: d.getFullYear(), month: d.getMonth() });
                  }
                  return months.map(({ year, month }) => {
                    const ms = getMonthSales(sellerDetail.sales, year, month);
                    const total = monthTotal(ms);
                    return (
                      <Card key={`${year}-${month}`} style={{ marginBottom: h.space(1), display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: h.space(2) }}>
                        <div style={{ fontWeight: 600, fontSize: "15px", color: h.color.ink }}>{monthLabel(year, month)} <span style={{ color: h.color.inkMuted, fontWeight: 400 }}>— ${total.toFixed(2)} sold</span></div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="sm" variant="outline" disabled={ms.length === 0} onClick={() => downloadMonthFile(selectedSeller.shop_name, sellerDetail.sales, year, month, "csv")}>Download CSV</Button>
                          <Button size="sm" variant="outline" disabled={ms.length === 0} onClick={() => downloadMonthFile(selectedSeller.shop_name, sellerDetail.sales, year, month, "pdf")}>Download PDF</Button>
                        </div>
                      </Card>
                    );
                  });
                })()}
                {sellerDetail.sales.length === 0 && <p style={{ fontSize: "14px", color: h.color.inkMuted }}>No sales yet.</p>}
              </div>

              {/* Month picker for any month */}
              <Card>
                <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Download Any Month</h3>
                <div style={{ display: "flex", alignItems: "center", gap: h.space(2), flexWrap: "wrap" }}>
                  <select value={pickerMonth} onChange={e => setPickerMonth(e.target.value)} style={{ padding: "6px 10px", borderRadius: h.radius.md, border: `1px solid ${h.color.line}`, fontFamily: h.font.sans, fontSize: "14px", color: h.color.ink, background: h.color.surface, outline: "none" }}>
                    <option value="">Select month...</option>
                    {monthOptions(selectedSeller.created_at).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <Button size="sm" variant="outline" disabled={!pickerMonth} onClick={() => { const [y, m] = pickerMonth.split("-").map(Number); downloadMonthFile(selectedSeller.shop_name, sellerDetail.sales, y, m, "csv"); }}>Download CSV</Button>
                  <Button size="sm" variant="outline" disabled={!pickerMonth} onClick={() => { const [y, m] = pickerMonth.split("-").map(Number); downloadMonthFile(selectedSeller.shop_name, sellerDetail.sales, y, m, "pdf"); }}>Download PDF</Button>
                </div>
              </Card>

              {/* Assigned books for seller */}
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: h.space(2) }}>
                  <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: 0 }}>Assigned Books</h3>
                  <Button size="sm" variant="outline" onClick={selectAllSellerBooks}>Select All</Button>
                </div>
                <p style={{ fontSize: "13px", color: h.color.inkMuted, margin: `0 0 ${h.space(2)}` }}>Choose which books this seller is allowed to sell.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 250, overflowY: "auto" }}>
                  {books.map(b => (
                    <label key={b.id} style={{ display: "flex", alignItems: "center", gap: h.space(2), padding: `${h.space(1)} ${h.space(2)}`, border: `1px solid ${h.color.lineSoft}`, borderRadius: h.radius.md, cursor: "pointer", background: sellerBookIds.has(b.id) ? h.color.accentSoft : h.color.surface }}>
                      <input type="checkbox" checked={sellerBookIds.has(b.id)} onChange={() => toggleSellerBook(b.id)} style={{ width: 18, height: 18 }} />
                      <span style={{ fontSize: "14px", color: h.color.ink }}>{b.title} <span style={{ color: h.color.inkMuted, fontSize: "12px" }}>· {b.author} · ${num(b.price).toFixed(2)}</span></span>
                    </label>
                  ))}
                </div>
                <Button size="sm" onClick={saveSellerBooks} disabled={bookAssignSaving} style={{ marginTop: h.space(2) }}>{bookAssignSaving ? "Saving..." : "Save Assigned Books"}</Button>
              </Card>

              <div>
                <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(1)}` }}>Payouts</h3>
                {sellerDetail.payouts.length === 0 ? <p style={{ fontSize: "14px", color: h.color.inkMuted }}>No payouts yet.</p> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sellerDetail.payouts.map((p: any) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                        <span>${num(p.amount).toFixed(2)}</span>
                        <span style={{ color: h.color.inkMuted }}>{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: h.space(2), flexWrap: "wrap", borderTop: `1px solid ${h.color.lineSoft}`, paddingTop: h.space(3) }}>
                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/customize-seller/${selectedSeller.id}`)}>Customize Page</Button>
                {resetConfirm ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { resetSellerPassword(selectedSeller.email); setResetConfirm(false); }}>Confirm Reset</Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetConfirm(false)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setResetConfirm(true)}>Reset Password</Button>
                )}
                {deleteConfirm === selectedSeller.id ? (
                  <>
                    <Button size="sm" variant="danger" onClick={() => deleteSeller(selectedSeller.id)}>Confirm Delete</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(selectedSeller.id)}>Delete Account</Button>
                )}
              </div>
            </div>
          ) : <EmptyState>Unable to load seller details.</EmptyState>}
        </Modal>
      )}

      {/* DIRECT SALES SECTION (shown on sellers tab) */}
      {tab === "sellers" && directSales.length > 0 && (
        <Card style={{ marginTop: h.space(3) }}>
          <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Direct Sales (no seller attribution)</h3>
          <div style={{ fontSize: "14px", color: h.color.inkMuted, marginBottom: h.space(2) }}>{directSales.length} direct sale{directSales.length === 1 ? "" : "s"} · ${directSales.reduce((sum, s) => sum + num(s.amount), 0).toFixed(2)} total</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {directSales.map(s => { const b = books.find(x => x.id === s.book_id); return (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "4px 0", borderBottom: `1px solid ${h.color.lineSoft}` }}>
                <span>{b?.title || "Unknown book"}{s.refunded ? " (refunded)" : ""}</span>
                <span style={{ color: h.color.inkMuted }}>${num(s.amount).toFixed(2)} · {new Date(s.sale_date).toLocaleDateString()}</span>
              </div>
            ); })}
          </div>
        </Card>
      )}

      {/* BOOKS TAB */}
      {tab === "books" && (
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(3), marginTop: h.space(3) }}>
          <div>
            <Button onClick={() => { setEditingBook(null); setBookForm({ title: "", author: "", description: "", price: "", gumroad_url: "", cover_image_url: "", sample_pdf_url: "", sample_text: "", commission_pct: "30", gumroad_permalink: "", category: "" }); setShowBookForm(true); }}>Add New Book</Button>
          </div>

          {showBookForm && (
            <Card>
              <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>{editingBook ? "Edit Book" : "Add New Book"}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: h.space(2) }}>
                  <Input placeholder="Title" value={bookForm.title} onChange={e => setBookForm({ ...bookForm, title: e.target.value })} />
                  <Input placeholder="Author" value={bookForm.author} onChange={e => setBookForm({ ...bookForm, author: e.target.value })} />
                </div>
                <Textarea placeholder="Description" value={bookForm.description} onChange={e => setBookForm({ ...bookForm, description: e.target.value })} rows={3} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: h.space(2) }}>
                  <Input placeholder="Price (e.g. 4.99)" type="number" value={bookForm.price} onChange={e => setBookForm({ ...bookForm, price: e.target.value })} />
                  <Input placeholder="Commission %" type="number" value={bookForm.commission_pct} onChange={e => setBookForm({ ...bookForm, commission_pct: e.target.value })} />
                </div>
                <Input placeholder="Gumroad URL" value={bookForm.gumroad_url} onChange={e => setBookForm({ ...bookForm, gumroad_url: e.target.value })} />
                <div>
                  <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Cover Image</label>
                  <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadCoverImage(f); }} style={{ fontSize: "14px", color: h.color.inkSoft }} disabled={coverUploading} />
                  {coverUploading && <span style={{ fontSize: "13px", color: h.color.inkMuted, marginLeft: 8 }}>Uploading...</span>}
                  {bookForm.cover_image_url && !coverUploading && <img src={bookForm.cover_image_url} alt="Cover preview" style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 4, marginTop: 8 }} />}
                </div>
                <Input placeholder="Gumroad permalink (optional)" value={bookForm.gumroad_permalink} onChange={e => setBookForm({ ...bookForm, gumroad_permalink: e.target.value })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: h.space(2) }}>
                  <Input placeholder="Category (e.g. Self-Help)" value={bookForm.category} onChange={e => setBookForm({ ...bookForm, category: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Sample PDF (watermarked automatically)</label>
                  <input type="file" accept="application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) uploadSamplePdf(f); }} style={{ fontSize: "14px", color: h.color.inkSoft }} disabled={pdfUploading} />
                  {pdfUploading && <span style={{ fontSize: "13px", color: h.color.inkMuted, marginLeft: 8 }}>Uploading & watermarking...</span>}
                  {bookForm.sample_pdf_url && !pdfUploading && <span style={{ fontSize: "13px", color: h.color.success, marginLeft: 8 }}>PDF uploaded</span>}
                </div>
                <Textarea placeholder="Sample text (optional)" value={bookForm.sample_text} onChange={e => setBookForm({ ...bookForm, sample_text: e.target.value })} rows={3} />
                <div style={{ display: "flex", gap: h.space(2) }}>
                  <Button onClick={saveBook} disabled={bookSaving || pdfUploading || coverUploading || !bookForm.title || !bookForm.gumroad_url}>{bookSaving ? "Saving..." : pdfUploading ? "Uploading PDF..." : editingBook ? "Update book" : "Add book"}</Button>
                  <Button variant="ghost" onClick={() => { setShowBookForm(false); setEditingBook(null); }}>Cancel</Button>
                </div>
              </div>
            </Card>
          )}

          {books.length === 0 ? <EmptyState>No books yet.</EmptyState> : books.map(b => (
            <Card key={b.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: h.space(3), flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: h.space(2), alignItems: "flex-start" }}>
                  {b.cover_image_url && <img src={b.cover_image_url} alt={b.title} style={{ width: 48, height: 64, objectFit: "cover", borderRadius: 4 }} />}
                  <div>
                    <div style={{ fontFamily: h.font.serif, fontWeight: 600, color: h.color.ink }}>{b.title}</div>
                    <div style={{ fontSize: "14px", color: h.color.inkMuted }}>{b.author} - ${num(b.price).toFixed(2)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Button size="sm" variant="outline" onClick={() => toggleBookVisibility(b.id, "show_reviews")}>{b.show_reviews !== false ? "Hide Reviews" : "Show Reviews"}</Button>
                  <Button size="sm" variant="outline" onClick={() => toggleBookVisibility(b.id, "show_sales_count")}>{b.show_sales_count !== false ? "Hide Units Sold" : "Show Units Sold"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingBook(b);
                    setBookForm({ title: b.title || "", author: b.author || "", description: b.description || "", price: String(b.price || ""), gumroad_url: b.gumroad_url || "", cover_image_url: b.cover_image_url || "", sample_pdf_url: b.sample_pdf_url || "", sample_text: b.sample_text || "", commission_pct: String(b.commission_pct || "30"), gumroad_permalink: b.gumroad_permalink || "", category: b.category || "" });
                    setShowBookForm(true);
                  }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteBook(b.id)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* MANUAL SALE TAB */}
      {tab === "sales" && (
        <div style={{ marginTop: h.space(3) }}>
          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>Record Manual Sale</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
              <Select value={manualSale.sellerId} onChange={e => setManualSale({ ...manualSale, sellerId: e.target.value })}>
                <option value="">Select seller...</option>
                {sellers.filter(s => s.approval_status === "approved").map(s => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
              </Select>
              <Select value={manualSale.bookId} onChange={e => setManualSale({ ...manualSale, bookId: e.target.value })}>
                <option value="">Select book...</option>
                {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              </Select>
              <Input placeholder="Amount (commission amount)" type="number" value={manualSale.amount} onChange={e => setManualSale({ ...manualSale, amount: e.target.value })} />
              <Button onClick={addManualSale} disabled={addingSale || !manualSale.sellerId || !manualSale.bookId || !manualSale.amount}>{addingSale ? "Adding..." : "Record sale"}</Button>
            </div>
          </Card>
        </div>
      )}

      {/* PAYOUTS TAB */}
      {tab === "payouts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(3), marginTop: h.space(3) }}>
          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>Ready for Payout</h3>
            <p style={{ fontSize: "14px", color: h.color.inkMuted, margin: `0 0 ${h.space(2)}` }}>Sellers with $100 or more owed balance. Enter an amount to record a partial or full payout.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
              {sellers.filter(s => s.approval_status === "approved").map(s => {
                const owed = sellerOwedBalances[s.id] || 0;
                const ready = owed >= 100;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: h.space(2), flexWrap: "wrap", padding: `${h.space(1)} 0`, borderBottom: `1px solid ${h.color.lineSoft}` }}>
                    <div>
                      <div style={{ fontWeight: 600, color: h.color.ink, fontSize: "15px" }}>{s.shop_name}</div>
                      <div style={{ fontSize: "13px", color: ready ? h.color.accent : h.color.inkMuted }}>Owed: ${owed.toFixed(2)}{ready ? " - Ready for payout" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                      <Input type="number" placeholder="Amount" value={payoutAmounts[s.id] || ""} onChange={e => setPayoutAmounts(prev => ({ ...prev, [s.id]: e.target.value }))} style={{ width: 100 }} />
                      <Button size="sm" onClick={() => createPayout(s.id)} disabled={creatingPayout === s.id || !payoutAmounts[s.id]}>{creatingPayout === s.id ? "..." : "Pay"}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>All Payouts</h3>
            {payouts.length === 0 ? <EmptyState>No payouts yet.</EmptyState> : payouts.map(p => {
              const seller = sellers.find(s => s.id === p.seller_id);
              return (
                <Card key={p.id} style={{ marginBottom: h.space(1) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: h.space(2) }}>
                    <div>
                      <div style={{ fontWeight: 600, color: h.color.ink }}>${num(p.amount).toFixed(2)}</div>
                      <div style={{ fontSize: "13px", color: h.color.inkMuted }}>{seller?.shop_name || "Unknown"} - {new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: p.paid ? h.color.success : h.color.warning }}>{p.paid ? "Paid" : "Pending"}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* MESSAGES TAB */}
      {tab === "messages" && (
        <div style={{ display: "flex", gap: h.space(3), marginTop: h.space(3), flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 200px", maxWidth: 200 }}>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Sellers</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sellers.filter(s => s.approval_status === "approved").map(s => (
                <button key={s.id} onClick={() => setChatSellerId(s.id)} style={{ textAlign: "left", padding: `${h.space(1)} ${h.space(2)}`, border: chatSellerId === s.id ? `1px solid ${h.color.accent}` : `1px solid ${h.color.lineSoft}`, borderRadius: h.radius.md, background: chatSellerId === s.id ? h.color.accentSoft : h.color.surface, cursor: "pointer", fontFamily: h.font.sans, fontSize: "14px", color: h.color.ink, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{s.shop_name}</span>
                  {unreadChatCounts[s.id] > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: h.color.danger, flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            {!chatSellerId ? <EmptyState>Select a seller to start chatting.</EmptyState> : (
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

      {/* PROMO TAB */}
      {tab === "promo" && (
        <div style={{ marginTop: h.space(3) }}>
          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>Promo Banner Settings</h3>
            {promoSettings ? (
              <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
                <label style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                  <input type="checkbox" checked={promoSettings.promo_enabled || false} onChange={e => setPromoSettings({ ...promoSettings, promo_enabled: e.target.checked })} />
                  <span style={{ fontSize: "14px", fontWeight: 600, color: h.color.inkSoft }}>Promo banner enabled</span>
                </label>
                <Input placeholder="Headline" value={promoSettings.headline || ""} onChange={e => setPromoSettings({ ...promoSettings, headline: e.target.value })} />
                <Input placeholder="Subtext" value={promoSettings.subtext || ""} onChange={e => setPromoSettings({ ...promoSettings, subtext: e.target.value })} />
                <Input placeholder="Discount %" type="number" value={promoSettings.discount_pct || ""} onChange={e => setPromoSettings({ ...promoSettings, discount_pct: e.target.value })} />
                <Button onClick={savePromoSettings}>Save promo settings</Button>
              </div>
            ) : <EmptyState>No promo settings found.</EmptyState>}
          </Card>
          <Card style={{ marginTop: h.space(3) }}>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>App Settings</h3>
            {appSettings ? (
              <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
                <Input placeholder="Author form URL" value={appSettings.author_form_url || ""} onChange={e => setAppSettings({ ...appSettings, author_form_url: e.target.value })} />
                <div>
                  <label style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>CONTACT EMAIL (shown in footer)</label>
                  <Input placeholder="hello@litora.com" value={appSettings.contact_email || ""} onChange={e => setAppSettings({ ...appSettings, contact_email: e.target.value })} />
                </div>
                <Button onClick={saveAppSettings}>Save app settings</Button>
              </div>
            ) : <EmptyState>No app settings found.</EmptyState>}
          </Card>
        </div>
      )}

      {/* AUTHOR REQUESTS TAB */}
      {tab === "authors" && (
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(2), marginTop: h.space(3) }}>
          <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: h.space(2) }}>
            <div>
              <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: 0 }}>Author Management</h3>
              <p style={{ fontSize: "14px", color: h.color.inkMuted, margin: `${h.space(1)} 0 0` }}>Manage author accounts, assign books, track sales, and process payouts.</p>
            </div>
            <Button onClick={() => navigate("/admin/authors")}>Open Author Dashboard</Button>
          </Card>
          {authorRequests.length === 0 ? <EmptyState>No author requests yet.</EmptyState> : authorRequests.map(r => (
            <Card key={r.id} style={{ border: r.viewed_by_admin ? `1px solid ${h.color.lineSoft}` : `1px solid ${h.color.accent}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: h.space(2) }}>
                <div>
                  <div style={{ fontWeight: 600, color: h.color.ink }}>{r.name}</div>
                  <div style={{ fontSize: "14px", color: h.color.inkMuted }}>{r.email}</div>
                  <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 2 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                {!r.viewed_by_admin && <Button size="sm" variant="outline" onClick={() => markAuthorRequestViewed(r.id)}>Mark viewed</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* EVENTS TAB */}
      {tab === "events" && (
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(3), marginTop: h.space(3) }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${h.color.lineSoft}`, flexWrap: "wrap" }}>
            <Tab active={eventsTab === "list"} onClick={() => setEventsTab("list")}>Events</Tab>
            <Tab active={eventsTab === "create"} onClick={() => setEventsTab("create")}>Create Event</Tab>
            <Tab active={eventsTab === "requests"} onClick={() => setEventsTab("requests")} dot={pendingEventRequests.length > 0}>Requests{pendingEventRequests.length > 0 ? ` (${pendingEventRequests.length})` : ""}</Tab>
          </div>

          {eventsTab === "list" && (
            <div>
              {events.length === 0 ? <EmptyState>No events created yet.</EmptyState> : events.map(e => (
                <Card key={e.id} style={{ marginBottom: h.space(2) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: h.space(3), flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: h.space(2), alignItems: "flex-start" }}>
                      {e.image_url && <img src={e.image_url} alt={e.title} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: h.radius.md }} />}
                      <div>
                        <div style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", color: h.color.ink }}>{e.title}</div>
                        <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 2 }}>{e.description?.slice(0, 80)}{e.description && e.description.length > 80 ? "..." : ""}</div>
                        {e.join_form_url && <div style={{ fontSize: "12px", color: h.color.inkMuted, marginTop: 4 }}>Form: {e.join_form_url.slice(0, 50)}...</div>}
                      </div>
                    </div>
                    <Button size="sm" variant="danger" onClick={() => deleteEvent(e.id)}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {eventsTab === "create" && (
            <Card>
              <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", margin: `0 0 ${h.space(2)}` }}>Create New Event</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
                <Input placeholder="Event title (e.g. Student Ambassador Program)" value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} />
                <Textarea placeholder="Event description" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} rows={3} />
                <div>
                  <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600, display: "block", marginBottom: 6 }}>Event Image</label>
                  <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadEventImage(f); }} style={{ fontSize: "14px", color: h.color.inkSoft }} disabled={eventImageUploading} />
                  {eventImageUploading && <span style={{ fontSize: "13px", color: h.color.inkMuted, marginLeft: 8 }}>Uploading...</span>}
                  {eventForm.image_url && !eventImageUploading && <img src={eventForm.image_url} alt="Event preview" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: h.radius.md, marginTop: 8 }} />}
                </div>
                <Input placeholder="YouTube video link (e.g. https://youtube.com/watch?v=...)" value={eventForm.youtube_url} onChange={e => setEventForm({ ...eventForm, youtube_url: e.target.value })} />
                <Textarea placeholder="Short description of what the video is about" value={eventForm.video_description} onChange={e => setEventForm({ ...eventForm, video_description: e.target.value })} rows={2} />
                <Input placeholder="Google Form link (for Join Now button)" value={eventForm.join_form_url} onChange={e => setEventForm({ ...eventForm, join_form_url: e.target.value })} />
                <Button onClick={saveEvent} disabled={eventSaving || eventImageUploading || !eventForm.title}>{eventSaving ? "Creating..." : "Create Event"}</Button>
              </div>
            </Card>
          )}

          {eventsTab === "requests" && (
            <div>
              {eventRequests.length === 0 ? <EmptyState>No event applications yet.</EmptyState> : eventRequests.map(r => {
                const event = events.find(e => e.id === r.event_id);
                return (
                  <Card key={r.id} style={{ marginBottom: h.space(2), border: r.status === "pending" ? `1px solid ${h.color.accent}` : `1px solid ${h.color.lineSoft}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: h.space(2) }}>
                      <div>
                        <div style={{ fontWeight: 600, color: h.color.ink, fontSize: "15px" }}>{event?.title || "Unknown event"}</div>
                        <div style={{ fontSize: "14px", color: h.color.inkMuted, marginTop: 2 }}>{r.user_email || "No email"}</div>
                        <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 2 }}>Applied: {new Date(r.created_at).toLocaleDateString()}</div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: r.status === "approved" ? h.color.success : r.status === "pending" ? h.color.warning : h.color.danger, marginTop: 4 }}>{r.status}</div>
                      </div>
                      {r.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="sm" onClick={() => approveEventRequest(r.id)}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => rejectEventRequest(r.id)}>Reject</Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
