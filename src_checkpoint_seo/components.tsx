import { useState, useEffect, createContext, useContext, useCallback, type ReactNode, type CSSProperties } from "react";
import { supabase } from "./supabase";
import { theme as h } from "./theme";
import { useSellerCustomization } from "./seller-customization";

export const num = (v: any, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
};

/* ===== Auth Context ===== */
interface AuthCtx {
  session: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthCtx>({ session: null, loading: true, signOut: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>;
}

/* ===== Settings Hook ===== */
export function useSettings() {
  const [promo, setPromo] = useState<any>(null);
  const [appSettings, setAppSettings] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("promo_banner_settings").select("*").eq("id", 1).maybeSingle();
      setPromo(p);
      const { data: a } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      setAppSettings(a);
    })();
  }, []);

  return { promo, appSettings };
}

/* ===== Layout ===== */
export function Layout({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  const { appSettings } = useSettings();
  const { customization } = useSellerCustomization();
  const contactEmail = appSettings?.contact_email || "hello@litora.com";
  const bgColor = customization?.backgroundColor || h.color.surfaceWarm;
  const fontFam = customization?.fontFamily || h.font.sans;
  const fontClr = customization?.fontColor || h.color.ink;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: bgColor, fontFamily: fontFam, color: fontClr }}>
      <Header />
      <main style={{ flex: 1, width: "100%", maxWidth: fullBleed ? "none" : 1080, margin: "0 auto", padding: fullBleed ? 0 : `${h.space(3)} ${h.space(2)}` }}>
        {children}
      </main>
      <footer style={{ borderTop: `1px solid ${h.color.lineSoft}`, padding: `${h.space(3)} ${h.space(2)}`, textAlign: "center", fontSize: "13px", color: h.color.inkMuted }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <span style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "16px", color: h.color.ink }}>Litora</span>
          <span style={{ margin: `0 ${h.space(1)}` }}>·</span>
          <span>A secure platform and global marketplace connecting independent authors with bookstores worldwide. Founded on the belief that great writing deserves a global audience — we connect independent authors and bookstores everywhere. Questions? Reach us at {contactEmail}.</span>
        </div>
      </footer>
    </div>
  );
}

/* ===== Header ===== */
export function Header() {
  const { session } = useAuth();
  const { customization } = useSellerCustomization();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const accentColor = customization?.accentColor || h.color.accent;
  const headerBg = scrolled ? h.color.surface : (customization?.backgroundColor || h.color.surfaceWarm);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const navLink: CSSProperties = {
    fontSize: "14px", fontWeight: 500, color: h.color.inkSoft, textDecoration: "none",
    transition: "color 0.15s", cursor: "pointer",
  };
  const navLinkHover = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = accentColor; };
  const navLinkOut = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = h.color.inkSoft; };

  const links = (
    <>
      <a href="/" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>Home</a>
      <a href="/become-seller" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>Become a Seller</a>
      <a href="/events" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>Events</a>
      <a href="/become-author" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>For Authors</a>
      <a href="/seller/login" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>Seller Login</a>
      <a href="/author/login" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>Author Login</a>
      {session && <a href="/seller/dashboard" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>Seller Dashboard</a>}
      <a href="/admin" style={navLink} onMouseEnter={navLinkHover} onMouseLeave={navLinkOut}>Admin</a>
    </>
  );

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: headerBg,
      borderBottom: scrolled ? `1px solid ${h.color.lineSoft}` : "1px solid transparent",
      transition: "background 0.2s, border-color 0.2s",
    }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: `${h.space(2)} ${h.space(2)}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: h.space(1) }}>
          {customization?.logoUrl ? (
            <img src={customization.logoUrl} alt="Logo" style={{ height: 32, objectFit: "contain" }} />
          ) : (
            <span style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "24px", color: h.color.ink, letterSpacing: "-0.02em" }}>Litora</span>
          )}
        </a>
        <nav style={{ display: "flex", gap: h.space(3), alignItems: "center" }} className="desktop-nav">
          {links}
        </nav>
        <button onClick={() => setMenuOpen(!menuOpen)} className="mobile-menu-btn" style={{ display: "none", background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: h.color.ink }}>
          ☰
        </button>
      </div>
      {menuOpen && (
        <div style={{ padding: `${h.space(2)} ${h.space(2)}`, borderTop: `1px solid ${h.color.lineSoft}`, display: "flex", flexDirection: "column", gap: h.space(2) }} className="mobile-nav">
          {links}
        </div>
      )}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
        @media (min-width: 769px) {
          .mobile-nav, .mobile-menu-btn { display: none !important; }
        }
      `}</style>
    </header>
  );
}

/* ===== Button ===== */
type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export function Button({
  children, onClick, variant = "primary", size = "md", disabled, style, type = "button",
}: {
  children: ReactNode; onClick?: () => void; variant?: ButtonVariant; size?: "sm" | "md";
  disabled?: boolean; style?: CSSProperties; type?: "button" | "submit";
}) {
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    borderRadius: h.radius.md, fontFamily: h.font.sans, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", border: "none",
    transition: "background 0.15s, opacity 0.15s, transform 0.1s", whiteSpace: "nowrap",
    opacity: disabled ? 0.5 : 1, fontSize: size === "sm" ? "13px" : "15px",
    padding: size === "sm" ? "6px 12px" : "10px 20px",
  };
  const { customization } = useSellerCustomization();
  const accentColor = customization?.accentColor || h.color.accent;
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: accentColor, color: "#fff" },
    outline: { background: "transparent", color: accentColor, border: `1px solid ${accentColor}` },
    ghost: { background: "transparent", color: h.color.inkSoft },
    danger: { background: h.color.danger, color: "#fff" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = "1"; }}
    >
      {children}
    </button>
  );
}

/* ===== Card ===== */
export function Card({ children, style, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  const { customization } = useSellerCustomization();
  const cardBg = customization?.cardBackgroundColor || h.color.surface;
  return (
    <div onClick={onClick} style={{
      background: cardBg, borderRadius: h.radius.lg, padding: h.space(3),
      border: `1px solid ${h.color.lineSoft}`, ...style,
    }}>
      {children}
    </div>
  );
}

/* ===== Input ===== */
export function Input({ placeholder, value, onChange, type = "text", style, onKeyDown }: {
  placeholder?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; style?: CSSProperties; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <input type={type} placeholder={placeholder} value={value} onChange={onChange} onKeyDown={onKeyDown}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: h.radius.md, border: `1px solid ${h.color.line}`,
        fontFamily: h.font.sans, fontSize: "15px", color: h.color.ink, background: h.color.surface,
        outline: "none", transition: "border-color 0.15s", ...style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = h.color.accent; }}
      onBlur={e => { e.currentTarget.style.borderColor = h.color.line; }}
    />
  );
}

/* ===== Textarea ===== */
export function Textarea({ placeholder, value, onChange, rows = 4, style }: {
  placeholder?: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number; style?: CSSProperties;
}) {
  return (
    <textarea placeholder={placeholder} value={value} onChange={onChange} rows={rows}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: h.radius.md, border: `1px solid ${h.color.line}`,
        fontFamily: h.font.sans, fontSize: "15px", color: h.color.ink, background: h.color.surface,
        outline: "none", transition: "border-color 0.15s", resize: "vertical", lineHeight: 1.5, ...style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = h.color.accent; }}
      onBlur={e => { e.currentTarget.style.borderColor = h.color.line; }}
    />
  );
}

/* ===== Select ===== */
export function Select({ value, onChange, children, style }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <select value={value} onChange={onChange}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: h.radius.md, border: `1px solid ${h.color.line}`,
        fontFamily: h.font.sans, fontSize: "15px", color: h.color.ink, background: h.color.surface,
        outline: "none", cursor: "pointer", ...style,
      }}
    >
      {children}
    </select>
  );
}

/* ===== PageHeading ===== */
export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: h.space(3) }}>
      <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "32px", color: h.color.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.02em" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: "16px", color: h.color.inkMuted, margin: `${h.space(1)} 0 0`, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  );
}

/* ===== EmptyState ===== */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: h.space(5), color: h.color.inkMuted, fontSize: "15px" }}>
      {children}
    </div>
  );
}

/* ===== Loading ===== */
export function Loading() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: h.space(5) }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${h.color.lineSoft}`, borderTopColor: h.color.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

/* ===== RatingStars ===== */
export function RatingStars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? "#e0a82e" : h.color.line, lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}

/* ===== Accordion ===== */
export function Accordion({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${h.color.lineSoft}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", padding: `${h.space(2)} 0`, background: "none", border: "none", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: h.font.sans, fontSize: "15px", fontWeight: 600, color: h.color.ink }}>
        {title}
        <span style={{ transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </button>
      {open && <div style={{ padding: `${h.space(1)} 0 ${h.space(3)}`, fontSize: "14px", color: h.color.inkSoft, lineHeight: 1.6 }}>{children}</div>}
    </div>
  );
}

/* ===== StatCard ===== */
export function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card style={{ padding: h.space(2) }}>
      <div style={{ fontSize: "12px", color: h.color.inkMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: "24px", fontFamily: h.font.serif, fontWeight: 700, color: accent ? h.color.accent : h.color.ink, marginTop: 4 }}>{value}</div>
    </Card>
  );
}

/* ===== ProgressBar ===== */
export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      {label && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: h.color.inkMuted, marginBottom: 4 }}>
        <span>{label}</span><span>{value} / {max}</span>
      </div>}
      <div style={{ height: 8, background: h.color.lineSoft, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: h.color.accent, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

/* ===== Tab ===== */
export function Tab({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: ReactNode; dot?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: `${h.space(2)} ${h.space(3)}`, background: "none", border: "none", borderBottom: active ? `2px solid ${h.color.accent}` : "2px solid transparent",
      fontFamily: h.font.sans, fontSize: "14px", fontWeight: 600, color: active ? h.color.ink : h.color.inkMuted,
      cursor: "pointer", transition: "color 0.15s", display: "flex", alignItems: "center", gap: 6,
    }}>
      {children}
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: h.color.danger }} />}
    </button>
  );
}

/* ===== PromoBanner ===== */
export function PromoBanner({ headline, subtext, discountPct }: { headline: string; subtext: string; discountPct: number }) {
  if (!headline) return null;
  return (
    <div style={{ background: h.color.accent, color: "#fff", padding: `${h.space(2)} ${h.space(3)}`, borderRadius: h.radius.lg, marginBottom: h.space(3), display: "flex", alignItems: "center", gap: h.space(2) }}>
      {discountPct > 0 && <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 10px", borderRadius: h.radius.md, fontWeight: 700, fontSize: "14px" }}>{discountPct}% OFF</span>}
      <div>
        <div style={{ fontWeight: 600, fontSize: "15px" }}>{headline}</div>
        {subtext && <div style={{ fontSize: "13px", opacity: 0.9 }}>{subtext}</div>}
      </div>
    </div>
  );
}

/* ===== Modal ===== */
export function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title?: string }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: h.space(2), overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: h.color.surface, borderRadius: h.radius.xl, maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: h.space(4), boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {title && <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "20px", color: h.color.ink, margin: `0 0 ${h.space(3)}` }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/* ===== SalesChart ===== */
export function SalesChart({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, padding: `${h.space(2)} 0` }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 30);
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: "11px", color: h.color.inkMuted, fontWeight: 600 }}>{d.value}</div>
            <div style={{ width: "100%", maxWidth: 40, height: Math.max(2, barH), background: h.color.accent, borderRadius: `${h.radius.sm} ${h.radius.sm} 0 0`, transition: "height 0.3s", opacity: d.value > 0 ? 1 : 0.3 }} />
            <div style={{ fontSize: "11px", color: h.color.inkMuted }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}
