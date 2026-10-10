import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Card, Input, PageHeading, Loading } from "../components";
import { useSEO } from "../seo";

export function SellerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useSEO({ title: "Seller Login - Litora Bookstore Marketplace", description: "Log in to your Litora QR storefront seller dashboard to manage ebooks and track indie bookstore revenue.", path: "/seller/login" });

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data.user) {
        const { data: seller } = await supabase.from("sellers").select("*").eq("id", data.user.id).maybeSingle();
        if (seller) {
          if (seller.approval_status === "pending") { setError("Your account is pending approval. Please wait for an admin to approve your application."); await supabase.auth.signOut(); setLoading(false); return; }
          if (seller.approval_status === "rejected") { setError("Your seller application was not approved. Please contact support if you believe this is an error."); await supabase.auth.signOut(); setLoading(false); return; }
          navigate("/seller/dashboard"); return;
        }
        const { data: isAdmin } = await supabase.rpc("is_admin");
        if (isAdmin) { navigate("/admin"); return; }
        const { data: student } = await supabase.from("students").select("*").eq("id", data.user.id).maybeSingle();
        if (student) { navigate("/student/dashboard"); return; }
        setError("No seller account found for this user.");
      }
    } catch (e: any) {
      setError(e.message || "Login failed. Check your credentials.");
    }
    setLoading(false);
  };

  return (
    <Layout>
      <PageHeading title="Seller Login" subtitle="Access your seller dashboard." />
      <Card style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
          <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleLogin(); }} />
          {error && <div style={{ fontSize: "14px", color: h.color.danger, padding: h.space(1), background: h.color.dangerSoft, borderRadius: h.radius.md }}>{error}</div>}
          <Button onClick={handleLogin} disabled={loading || !email || !password}>{loading ? <Loading /> : "Log In"}</Button>
          <div style={{ textAlign: "center", fontSize: "14px", color: h.color.inkMuted }}>
            Don't have an account? <a href="/become-seller" style={{ color: h.color.accent }}>Become a seller</a>
          </div>
          <div style={{ textAlign: "center", fontSize: "14px", color: h.color.inkMuted }}>
            Are you an author? <a href="/author/login" style={{ color: h.color.accent }}>Author Login</a>
          </div>
        </div>
      </Card>
    </Layout>
  );
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useSEO({ title: "Admin Login - Litora Bookstore Marketplace", description: "Admin access for Litora bookstore marketplace.", path: "/admin/login" });

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data.user) {
        const { data: isAdmin } = await supabase.rpc("is_admin");
        if (isAdmin) { navigate("/admin"); return; }
        setError("This account does not have admin access.");
        await supabase.auth.signOut();
      }
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("network")) {
        setError("Unable to connect to the server. Please check your internet connection and try again.");
      } else {
        setError(msg || "Invalid credentials.");
      }
    }
    setLoading(false);
  };

  return (
    <Layout>
      <PageHeading title="Admin Login" subtitle="Manage the Litora marketplace." />
      <Card style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
          <Input placeholder="Admin email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleLogin(); }} />
          {error && <div style={{ fontSize: "14px", color: h.color.danger, padding: h.space(1), background: h.color.dangerSoft, borderRadius: h.radius.md }}>{error}</div>}
          <Button onClick={handleLogin} disabled={loading || !email || !password}>{loading ? <Loading /> : "Log In"}</Button>
        </div>
      </Card>
    </Layout>
  );
}

export function AuthorLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useSEO({ title: "Author Login - Aadi Jain Books on Litora", description: "Log in to your author dashboard to track Aadi Jain books sales and earnings on Litora bookstore marketplace.", path: "/author/login" });

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data.user) {
        const { data: author } = await supabase.from("authors").select("*").eq("id", data.user.id).maybeSingle();
        if (author) {
          if (author.approval_status === "pending") { setError("Your account is pending approval. Please wait for an admin to approve your application."); await supabase.auth.signOut(); setLoading(false); return; }
          if (author.approval_status === "rejected") { setError("Your author application was not approved. Please contact support if you believe this is an error."); await supabase.auth.signOut(); setLoading(false); return; }
          navigate("/author/dashboard"); return;
        }
        const { data: seller } = await supabase.from("sellers").select("*").eq("id", data.user.id).maybeSingle();
        if (seller) { navigate("/seller/dashboard"); return; }
        const { data: isAdmin } = await supabase.rpc("is_admin");
        if (isAdmin) { navigate("/admin"); return; }
        const { data: student } = await supabase.from("students").select("*").eq("id", data.user.id).maybeSingle();
        if (student) { navigate("/student/dashboard"); return; }
        setError("No author account found for this user.");
      }
    } catch (e: any) {
      setError(e.message || "Login failed. Check your credentials.");
    }
    setLoading(false);
  };

  return (
    <Layout>
      <PageHeading title="Author Login" subtitle="Access your author dashboard." />
      <p style={{ textAlign: "center", fontSize: "14px", color: h.color.inkMuted, maxWidth: 420, margin: `0 auto ${h.space(2)}`, lineHeight: 1.5 }}>
        Log in to access your dashboard and submit new books via our book submission form.
      </p>
      <Card style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
          <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleLogin(); }} />
          {error && <div style={{ fontSize: "14px", color: h.color.danger, padding: h.space(1), background: h.color.dangerSoft, borderRadius: h.radius.md }}>{error}</div>}
          <Button onClick={handleLogin} disabled={loading || !email || !password}>{loading ? <Loading /> : "Log In"}</Button>
        </div>
      </Card>
    </Layout>
  );
}

export function NotFoundPage() {
  useSEO({ title: "Page Not Found - Litora Bookstore Marketplace", description: "The page you're looking for doesn't exist on Litora bookstore marketplace." });
  return (
    <Layout>
      <div style={{ textAlign: "center", padding: h.space(5) }}>
        <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "48px", color: h.color.ink, margin: 0 }}>404</h1>
        <p style={{ fontSize: "16px", color: h.color.inkMuted, marginTop: h.space(1) }}>Page not found.</p>
        <Button variant="outline" onClick={() => window.location.href = "/"} style={{ marginTop: h.space(2) }}>Back Home</Button>
      </div>
    </Layout>
  );
}
