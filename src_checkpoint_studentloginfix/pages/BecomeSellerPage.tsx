import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Card, Input, PageHeading, Loading } from "../components";
import { useSEO } from "../seo";

export function BecomeSellerPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ shopName: "", email: "", password: "" });
  const [tncAccepted, setTncAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useSEO({ title: "Become a Seller - Litora Bookstore Marketplace", description: "Start selling independent author ebooks on Litora bookstore marketplace. Set up your Litora QR storefront and grow your indie bookstore revenue with physical to digital book sales.", path: "/become-seller" });

  const handleSubmit = async () => {
    setError("");
    if (!form.shopName || !form.email || !form.password) { setError("Please fill in all required fields."); return; }
    if (!tncAccepted) { setError("Please accept the terms and conditions."); return; }
    setSubmitting(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email, password: form.password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Signup failed - no user returned.");

      const referral = form.shopName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) + Math.floor(Math.random() * 1000);
      const { error: insertError } = await supabase.from("sellers").insert({
        id: authData.user.id,
        shop_name: form.shopName,
        email: form.email,
        referral_code: referral,
        approval_status: "pending",
        tnc_accepted_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <Layout>
        <Card style={{ textAlign: "center", padding: h.space(5), maxWidth: 500, margin: "0 auto", marginTop: h.space(4) }}>
          <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "24px", color: h.color.ink, margin: `0 0 ${h.space(2)}` }}>Application Submitted!</h2>
          <p style={{ fontSize: "15px", color: h.color.inkMuted, lineHeight: 1.6, margin: `0 0 ${h.space(3)}` }}>Your seller account has been created and is pending approval. You'll receive an email once approved.</p>
          <div style={{ display: "flex", gap: h.space(2), justifyContent: "center" }}>
            <Button onClick={() => navigate("/seller/login")}>Go to Login</Button>
            <Button variant="outline" onClick={() => navigate("/")}>Back Home</Button>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeading title="Become a Seller" subtitle="Join Litora bookstore marketplace and start selling independent author ebooks. Set up your Litora QR storefront to drive indie bookstore revenue through physical to digital book sales." />
      <Card style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
          <Input placeholder="Shop name *" value={form.shopName} onChange={e => setForm({ ...form, shopName: e.target.value })} />
          <Input placeholder="Email *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Password *" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", color: h.color.inkSoft }}>
            <input type="checkbox" checked={tncAccepted} onChange={e => setTncAccepted(e.target.checked)} />
            <span>I accept the <a href="/terms" style={{ color: h.color.accent }}>terms and conditions</a></span>
          </label>
          {error && <div style={{ fontSize: "14px", color: h.color.danger, padding: h.space(1), background: h.color.dangerSoft, borderRadius: h.radius.md }}>{error}</div>}
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? <Loading /> : "Create Account"}</Button>
        </div>
      </Card>
    </Layout>
  );
}
