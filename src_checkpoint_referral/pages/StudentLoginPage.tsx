import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Card, Input, PageHeading, Loading } from "../components";
import { useSEO } from "../seo";

export function StudentLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useSEO({ title: "Student Login - Litora Bookstore Marketplace", description: "Log in or sign up as a Student Ambassador on Litora bookstore marketplace.", path: "/student/login" });

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (data.user) {
          const { error: insertErr } = await supabase.from("students").insert({
            id: data.user.id,
            email: data.user.email || email,
            name: name || "",
            approval_status: "approved",
          });
          if (insertErr) {
            console.error("Failed to create student profile:", insertErr.message);
          }
          navigate("/student/dashboard");
          return;
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        if (data.user) {
          const { data: student } = await supabase.from("students").select("*").eq("id", data.user.id).maybeSingle();
          if (student) {
            if (student.approval_status === "rejected") { setError("Your student account is not active. Please contact support."); await supabase.auth.signOut(); setLoading(false); return; }
            navigate("/student/dashboard"); return;
          }
          const { data: seller } = await supabase.from("sellers").select("*").eq("id", data.user.id).maybeSingle();
          if (seller) { navigate("/seller/dashboard"); return; }
          const { data: author } = await supabase.from("authors").select("*").eq("id", data.user.id).maybeSingle();
          if (author) { navigate("/author/dashboard"); return; }
          const { data: isAdmin } = await supabase.rpc("is_admin");
          if (isAdmin) { navigate("/admin"); return; }
          const { error: createErr } = await supabase.from("students").insert({ id: data.user.id, email: data.user.email || email, name: "", approval_status: "approved" });
          if (!createErr) { navigate("/student/dashboard"); return; }
          setError("No student account found. If you were approved for a program, try signing up with the same email.");
        }
      }
    } catch (e: any) {
      setError(e.message || "Authentication failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <Layout>
      <PageHeading title={mode === "login" ? "Student Login" : "Student Sign Up"} subtitle="Access your Student Ambassador dashboard." />
      <Card style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
          {mode === "signup" && (
            <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
          )}
          <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} />
          {error && <div style={{ fontSize: "14px", color: h.color.danger, padding: h.space(1), background: h.color.dangerSoft, borderRadius: h.radius.md }}>{error}</div>}
          <Button onClick={handleSubmit} disabled={loading || !email || !password}>{loading ? <Loading /> : mode === "login" ? "Log In" : "Sign Up"}</Button>
          <div style={{ textAlign: "center", fontSize: "14px", color: h.color.inkMuted }}>
            {mode === "login" ? (
              <>New student? <a href="#" onClick={e => { e.preventDefault(); setMode("signup"); }} style={{ color: h.color.accent }}>Sign up here</a></>
            ) : (
              <>Already have an account? <a href="#" onClick={e => { e.preventDefault(); setMode("login"); }} style={{ color: h.color.accent }}>Log in</a></>
            )}
          </div>
        </div>
      </Card>
    </Layout>
  );
}
