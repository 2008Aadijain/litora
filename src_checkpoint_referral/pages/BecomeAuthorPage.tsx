import { useState } from "react";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Card, Input, PageHeading, EmptyState, Loading } from "../components";
import { useSEO } from "../seo";
import { useSettings } from "../components";

export function BecomeAuthorPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { appSettings } = useSettings();

  useSEO({ title: "For Authors - Aadi Jain Books on Litora Bookstore Marketplace", description: "Create your author account on Litora bookstore marketplace and reach bookstores worldwide. Publish your Aadi Jain books and earn through Litora QR storefronts.", path: "/become-author" });

  const handleSubmit = async () => {
    setError("");
    if (!form.name || !form.email || !form.password) return;
    if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setSubmitting(true);
    try {
      const { data: signUpData, error: authError } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (authError) throw authError;
      if (!signUpData.user) throw new Error("Signup failed - no user returned.");

      // signUp may not return a session if email confirmation is enabled.
      // In that case, sign in immediately to get an authenticated session
      // so the authors profile insert passes RLS (auth.uid() = id).
      if (!signUpData.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (signInError) throw signInError;
      }

      const { error: dbError } = await supabase.from("authors").insert({ id: signUpData.user.id, name: form.name, email: form.email });
      if (dbError) {
        if (dbError.code === "23505") {
          throw new Error("An account with this email already exists.");
        }
        throw dbError;
      }
      setSubmitted(true);
    } catch (e: any) {
      const msg = e?.message || "Failed to create account.";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        setError("An account with this email already exists. Try logging in instead.");
      } else {
        setError(msg);
      }
    }
    setSubmitting(false);
  };

  return (
    <Layout>
      <PageHeading title="For Authors" subtitle="Create your author account on Litora bookstore marketplace. Publish your Aadi Jain books and reach bookstores worldwide through Litora QR storefronts." />
      {submitted ? (
        <Card style={{ textAlign: "center", padding: h.space(5), maxWidth: 500 }}>
          <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "22px", color: h.color.ink, margin: `0 0 ${h.space(2)}` }}>You are now a member.</h2>
          <p style={{ fontSize: "15px", color: h.color.inkMuted, lineHeight: 1.6, margin: `0 0 ${h.space(3)}` }}>Your author account has been created. Log in anytime via Author Login to see your dashboard.</p>
          <a href="/author/login"><Button>Go to Author Login</Button></a>
        </Card>
      ) : appSettings?.author_form_url ? (
        <Card style={{ textAlign: "center", padding: h.space(4) }}>
          <p style={{ fontSize: "15px", color: h.color.inkSoft, marginBottom: h.space(2) }}>Fill out our author submission form to get started.</p>
          <Button onClick={() => window.open(appSettings.author_form_url, "_blank")}>Open Author Form</Button>
        </Card>
      ) : (
        <Card style={{ maxWidth: 480 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>NAME</label>
              <Input placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>EMAIL</label>
              <Input placeholder="Your email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "13px", color: h.color.inkMuted, fontWeight: 600 }}>PASSWORD</label>
              <Input placeholder="Choose a password (min 6 chars)" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} />
            </div>
            {error && <div style={{ fontSize: "14px", color: h.color.danger, padding: h.space(1), background: h.color.dangerSoft, borderRadius: h.radius.md }}>{error}</div>}
            <Button onClick={handleSubmit} disabled={submitting || !form.name || !form.email || !form.password}>{submitting ? <Loading /> : "Create Author Account"}</Button>
            <div style={{ textAlign: "center", fontSize: "14px", color: h.color.inkMuted }}>
              Already have an account? <a href="/author/login" style={{ color: h.color.accent }}>Author Login</a>
            </div>
          </div>
        </Card>
      )}
    </Layout>
  );
}
