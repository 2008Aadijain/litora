import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Loading, EmptyState, Card, Tab, Input, Textarea, num, useAuth } from "../components";
import { useSEO } from "../seo";

export function StudentDashboardPage() {
  const { session, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  const [bookstoreNames, setBookstoreNames] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [savingBookstores, setSavingBookstores] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useSEO({ title: "Student Dashboard - Litora Bookstore Marketplace", description: "Student Ambassador dashboard — track bookstore signups, earnings, and notifications.", path: "/student/dashboard" });

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);

    const [studentRes, subsRes, notifRes, payRes] = await Promise.all([
      supabase.from("students").select("*").eq("id", session.user.id).maybeSingle(),
      supabase.from("bookstore_submissions").select("*").eq("student_id", session.user.id).order("created_at", { ascending: false }),
      supabase.from("student_notifications").select("*").eq("student_id", session.user.id).order("created_at", { ascending: false }),
      supabase.from("student_payments").select("*").eq("student_id", session.user.id).order("created_at", { ascending: false }),
    ]);

    setStudent(studentRes.data);
    setSubmissions(subsRes.data || []);
    setNotifications(notifRes.data || []);
    setPayments(payRes.data || []);

    // Mark notifications as read
    await supabase.from("student_notifications").update({ read: true }).eq("student_id", session.user.id).eq("read", false);

    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!authLoading && !session) navigate("/student/login");
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (authLoading || !session) return;
    (async () => {
      const { data } = await supabase.from("students").select("*").eq("id", session.user.id).maybeSingle();
      if (!data) { navigate("/student/login"); return; }
      loadData();
    })();
  }, [authLoading, session, navigate, loadData]);

  const addBookstores = async () => {
    if (!session?.user?.id || !bookstoreNames.trim()) return;
    setSavingBookstores(true);
    const names = bookstoreNames.trim().split("\n").map(n => n.trim()).filter(n => n.length > 0);
    const newSubs: any[] = [];
    for (const name of names) {
      const { data: existing } = await supabase.from("bookstore_submissions").select("id").eq("student_id", session.user.id).eq("bookstore_name", name).maybeSingle();
      if (existing) continue;

      const { data: dupElsewhere } = await supabase.from("bookstore_submissions").select("id").eq("bookstore_name", name).neq("student_id", session.user.id).limit(1);
      const isDup = (dupElsewhere || []).length > 0;

      const { data: inserted } = await supabase.from("bookstore_submissions").insert({
        student_id: session.user.id, bookstore_name: name, disqualified: isDup,
      }).select("*").single();

      if (inserted) {
        newSubs.push(inserted);
        if (isDup) {
          await supabase.from("student_notifications").insert({
            student_id: session.user.id,
            message: `This bookstore name has already been used — it's been disqualified: ${name}`,
            type: "disqualification", read: false,
          });
        }
      }
    }
    setSubmissions(prev => [...newSubs, ...prev]);
    setBookstoreNames("");
    setSavingBookstores(false);
  };

  const deleteSubmission = async (id: string) => {
    await supabase.from("bookstore_submissions").delete().eq("id", id);
    setSubmissions(prev => prev.filter(s => s.id !== id));
  };

  const shareList = () => {
    const valid = submissions.filter(s => !s.disqualified).map(s => s.bookstore_name);
    const text = `My Litora Bookstore Signups:\n${valid.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;
    if (navigator.share) {
      navigator.share({ title: "My Bookstore List", text });
    } else {
      navigator.clipboard.writeText(text);
      alert("List copied to clipboard!");
    }
  };

  const markNotifRead = async (id: string) => {
    await supabase.from("student_notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  if (authLoading || loading) return <Layout><Loading /></Layout>;
  if (!student) return <Layout><EmptyState>No student account found. <Button variant="outline" onClick={() => navigate("/student/login")}>Student Login</Button></EmptyState></Layout>;

  const unreadNotifs = notifications.filter(n => !n.read);
  const validBookstores = submissions.filter(s => !s.disqualified);
  const disqualifiedBookstores = submissions.filter(s => s.disqualified);

  return (
    <Layout>
      <div style={{ marginTop: h.space(3), display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: h.space(2) }}>
        <div>
          <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "28px", color: h.color.ink, margin: 0, letterSpacing: "-0.02em" }}>{student.name || student.email}</h1>
          <div style={{ fontSize: "14px", color: h.color.inkMuted, marginTop: 4 }}>Student Ambassador</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign Out</Button>
      </div>

      <div style={{ marginTop: h.space(3), display: "flex", borderBottom: `1px solid ${h.color.lineSoft}`, flexWrap: "wrap" }}>
        <Tab active={tab === "overview"} onClick={() => setTab("overview")}>Overview</Tab>
        <Tab active={tab === "bookstores"} onClick={() => setTab("bookstores")}>Bookstores</Tab>
        <Tab active={tab === "payments"} onClick={() => setTab("payments")}>Payments</Tab>
        <Tab active={tab === "notifications"} onClick={() => setTab("notifications")} dot={unreadNotifs.length > 0}>Notifications{unreadNotifs.length > 0 ? ` (${unreadNotifs.length})` : ""}</Tab>
      </div>

      {tab === "overview" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(3) }}>
          <Card>
            <div style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>TOTAL EARNING</div>
            <div style={{ fontSize: "32px", fontFamily: h.font.serif, fontWeight: 700, color: h.color.accent }}>${num(student.total_earning).toFixed(2)}</div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: h.space(2) }}>
            <Card style={{ padding: h.space(2) }}>
              <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>BOOKSTORES ONBOARDED</div>
              <div style={{ fontSize: "24px", fontFamily: h.font.serif, fontWeight: 700, color: h.color.ink, marginTop: 4 }}>{validBookstores.length}</div>
            </Card>
            <Card style={{ padding: h.space(2) }}>
              <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>DISQUALIFIED</div>
              <div style={{ fontSize: "24px", fontFamily: h.font.serif, fontWeight: 700, color: h.color.danger, marginTop: 4 }}>{disqualifiedBookstores.length}</div>
            </Card>
            <Card style={{ padding: h.space(2) }}>
              <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600 }}>PAYMENTS RECEIVED</div>
              <div style={{ fontSize: "24px", fontFamily: h.font.serif, fontWeight: 700, color: h.color.ink, marginTop: 4 }}>{payments.length}</div>
            </Card>
          </div>
        </div>
      )}

      {tab === "bookstores" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(3) }}>
          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>Add Bookstore Names</h3>
            <p style={{ fontSize: "14px", color: h.color.inkMuted, marginBottom: h.space(2) }}>Enter one bookstore name per line. Duplicate names (already submitted by anyone) will be automatically disqualified.</p>
            <Textarea placeholder={"Bookstore Name 1\nBookstore Name 2\nBookstore Name 3"} value={bookstoreNames} onChange={e => setBookstoreNames(e.target.value)} rows={5} />
            <div style={{ display: "flex", gap: h.space(2), marginTop: h.space(2) }}>
              <Button size="sm" onClick={addBookstores} disabled={savingBookstores || !bookstoreNames.trim()}>{savingBookstores ? "Saving..." : "Add Bookstores"}</Button>
              <Button size="sm" variant="outline" onClick={shareList} disabled={submissions.length === 0}>Share List</Button>
            </div>
          </Card>

          <Card>
            <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", margin: `0 0 ${h.space(2)}` }}>My Bookstore List</h3>
            {submissions.length === 0 ? <EmptyState>No bookstores added yet.</EmptyState> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {submissions.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${h.space(1)} ${h.space(2)}`, borderRadius: h.radius.md, background: s.disqualified ? h.color.dangerSoft : h.color.surfaceAlt, border: `1px solid ${s.disqualified ? h.color.danger : h.color.lineSoft}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
                      <span style={{ fontSize: "15px", fontWeight: 600, color: s.disqualified ? h.color.danger : h.color.ink }}>{s.bookstore_name}</span>
                      {s.disqualified && <span style={{ fontSize: "11px", fontWeight: 700, color: h.color.danger, textTransform: "uppercase" }}>Disqualified</span>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => deleteSubmission(s.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "payments" && (
        <div style={{ marginTop: h.space(3), display: "flex", flexDirection: "column", gap: h.space(2) }}>
          {payments.length === 0 ? <EmptyState>No payments recorded yet.</EmptyState> : payments.map(p => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: h.space(2) }}>
                <div>
                  <div style={{ fontWeight: 600, color: h.color.accent, fontSize: "18px" }}>${num(p.amount).toFixed(2)}</div>
                  <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 2 }}>{new Date(p.created_at).toLocaleDateString()}</div>
                </div>
                {p.screenshot_url && (
                  <a href={p.screenshot_url} target="_blank" rel="noopener noreferrer">
                    <img src={p.screenshot_url} alt="Payment proof" loading="lazy" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: h.radius.md, border: `1px solid ${h.color.lineSoft}` }} />
                  </a>
                )}
              </div>
            </Card>
          ))}
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
                {!n.read && <Button size="sm" variant="ghost" onClick={() => markNotifRead(n.id)}>Mark read</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
