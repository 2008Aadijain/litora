import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Loading, EmptyState, RatingStars, PromoBanner, useSettings, num } from "../components";
import { useSEO } from "../seo";
import { incrementSellerViews } from "../qr-utils";
import { setReferralCookie } from "../referral";
import { useSellerCustomization } from "../seller-customization";



type SortKey = "popular" | "newest" | "price_asc" | "price_desc" | "top_rated";

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [books, setBooks] = useState<any[]>([]);
  const [ratings, setRatings] = useState<Record<string, any>>({});
  const [salesCounts, setSalesCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const { promo } = useSettings();
  const { setCustomization, customization } = useSellerCustomization();
  const [welcomeSeller, setWelcomeSeller] = useState<any>(null);
  const [sellerBookIds, setSellerBookIds] = useState<Set<string> | null>(null);

  const [sort, setSort] = useState<SortKey>("popular");
  const [authorFilter, setAuthorFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useSEO({ title: "Litora - Book Marketplace for Independent Authors", description: "The marketplace connecting independent authors with bookstores. Discover premium titles and buy direct.", path: "/" });

  useEffect(() => {
    (async () => {
      const ref = searchParams.get("ref");
      if (ref) {
        const { data: seller } = await supabase.from("sellers").select("*").eq("referral_code", ref).maybeSingle();
        if (seller && seller.approval_status === "approved") {
          setWelcomeSeller(seller);
          setReferralCookie(seller.referral_code, seller.offer_code || undefined);
          incrementSellerViews(seller.id);
          const { data: sbData } = await supabase.from("seller_books").select("book_id").eq("seller_id", seller.id);
          if (sbData && sbData.length > 0) {
            setSellerBookIds(new Set(sbData.map((r: any) => r.book_id)));
          }
          const { data: cust } = await supabase.from("seller_page_customizations").select("*").eq("seller_id", seller.id).maybeSingle();
          if (cust) {
            setCustomization({ logoUrl: cust.logo_url || null, backgroundColor: cust.background_color || null, accentColor: cust.accent_color || null, cardBackgroundColor: cust.card_background_color || null, fontFamily: cust.font_family || null, fontColor: cust.font_color || null });
          }
        }
      } else {
        setCustomization(null);
      }
      const { data: booksData, error: booksError } = await supabase.from("books").select("*").order("created_at", { ascending: false });
      if (booksError) {
        console.error("[HomePage] books fetch error:", booksError);
        setFetchError(booksError.message);
        setLoading(false);
        return;
      }
      setBooks(booksData || []);

      const [ratingsRes, salesRes] = await Promise.all([
        supabase.from("book_rating_stats").select("*"),
        supabase.from("sales").select("book_id").eq("refunded", false),
      ]);

      if (ratingsRes.data) {
        const map: Record<string, any> = {};
        (ratingsRes.data).forEach((r: any) => { map[r.book_id] = r; });
        setRatings(map);
      }
      if (salesRes.data) {
        const counts: Record<string, number> = {};
        (salesRes.data).forEach((s: any) => {
          counts[s.book_id] = (counts[s.book_id] || 0) + 1;
        });
        setSalesCounts(counts);
      }
      setLoading(false);
    })();
  }, [searchParams]);

  const authors = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => { if (b.author) set.add(b.author); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [books]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => { if (b.category) set.add(b.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [books]);

  const sortedBooks = useMemo(() => {
    let list = [...books];
    if (sellerBookIds) list = list.filter(b => sellerBookIds.has(b.id));
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter(b => (b.title || "").toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q));
    if (authorFilter) list = list.filter(b => b.author === authorFilter);
    if (categoryFilter) list = list.filter(b => b.category === categoryFilter);

    const score = (b: any) => {
      const rt = ratings[b.id];
      const avg = rt ? num(rt.avg_rating) : 0;
      const cnt = rt ? num(rt.rating_count) : 0;
      const sales = salesCounts[b.id] || 0;
      return avg * 10 + cnt * 2 + sales * 5;
    };

    switch (sort) {
      case "newest":
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "price_asc":
        list.sort((a, b) => num(a.price) - num(b.price));
        break;
      case "price_desc":
        list.sort((a, b) => num(b.price) - num(a.price));
        break;
      case "top_rated": {
        list.sort((a, b) => {
          const ra = ratings[a.id] ? num(ratings[a.id].avg_rating) : 0;
          const rb = ratings[b.id] ? num(ratings[b.id].avg_rating) : 0;
          if (rb !== ra) return rb - ra;
          return (salesCounts[b.id] || 0) - (salesCounts[a.id] || 0);
        });
        break;
      }
      case "popular":
      default:
        list.sort((a, b) => score(b) - score(a));
        break;
    }
    return list;
  }, [books, ratings, salesCounts, sort, authorFilter, categoryFilter, searchQuery, sellerBookIds]);

  const custCardBg = customization?.cardBackgroundColor || h.color.surface;
  const custFontColor = customization?.fontColor || h.color.ink;
  const custFontFam = customization?.fontFamily || h.font.sans;
  const hasActiveFilters = sort !== "popular" || authorFilter || categoryFilter || searchQuery.trim() !== "";
  const compactSelect: React.CSSProperties = {
    padding: "5px 28px 5px 10px", borderRadius: h.radius.sm, border: `1px solid ${h.color.line}`,
    fontFamily: custFontFam, fontSize: "13px", color: custFontColor, background: custCardBg,
    outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%236b6b80' stroke-width='1.5' d='M1 1l4 4 4-4'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
  };

  return (
    <Layout>
      {welcomeSeller && (
        <div style={{
          background: h.color.ink, color: "#fff", borderRadius: h.radius.lg,
          padding: `${h.space(3)} ${h.space(4)}`, marginBottom: h.space(3),
          textAlign: "center",
        }}>
          <div style={{ fontFamily: h.font.sans, fontSize: "14px", opacity: 0.8, marginBottom: 4 }}>Welcome to</div>
          <div style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "26px" }}>{welcomeSeller.shop_name}</div>
          {welcomeSeller.offer_code && (
            <div style={{ marginTop: h.space(2), fontSize: "14px" }}>
              <span style={{ opacity: 0.8 }}>Use code </span>
              <code style={{ background: "rgba(255,255,255,0.15)", padding: "4px 12px", borderRadius: h.radius.md, fontWeight: 700, fontSize: "15px" }}>{welcomeSeller.offer_code}</code>
              <span style={{ opacity: 0.8 }}> at checkout</span>
              {num(welcomeSeller.seller_promo_pct) > 0 && (
                <span style={{ marginLeft: 8, background: h.color.accent, padding: "2px 10px", borderRadius: h.radius.md, fontWeight: 700 }}>{num(welcomeSeller.seller_promo_pct)}% OFF</span>
              )}
            </div>
          )}
          {welcomeSeller.seller_promo_message && (
            <div style={{ marginTop: h.space(1), fontSize: "13px", opacity: 0.85 }}>{welcomeSeller.seller_promo_message}</div>
          )}
        </div>
      )}
      {promo?.promo_enabled && !welcomeSeller && <PromoBanner headline={promo.headline} subtext={promo.subtext} discountPct={num(promo.discount_pct)} />}
      {!welcomeSeller && (
        <div style={{ marginBottom: h.space(4) }}>
          <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "36px", color: h.color.ink, margin: 0, lineHeight: 1.15, letterSpacing: "-0.02em" }}>Where independent authors meet bookstores</h1>
          <p style={{ fontSize: "16px", color: h.color.inkMuted, marginTop: h.space(1), maxWidth: 560, lineHeight: 1.5 }}>Litora is the marketplace connecting independent authors with bookstores worldwide. Discover premium titles you won't find anywhere else and buy direct from the people who create them.</p>
        </div>
      )}

      {!loading && !fetchError && books.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: h.space(2), flexWrap: "wrap",
          marginBottom: h.space(3), padding: `${h.space(1)} ${h.space(2)}`,
          background: custCardBg, border: `1px solid ${h.color.lineSoft}`, borderRadius: h.radius.md,
        }}>
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: h.color.inkMuted, pointerEvents: "none" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search books..."
              style={{ width: "100%", padding: "5px 10px 5px 32px", borderRadius: h.radius.sm, border: `1px solid ${h.color.line}`, fontFamily: custFontFam, fontSize: "13px", color: custFontColor, background: custCardBg, outline: "none" }}
            />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={compactSelect}>
            <option value="popular">Most Popular</option>
            <option value="top_rated">Top Rated</option>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
          <select value={authorFilter} onChange={e => setAuthorFilter(e.target.value)} style={compactSelect}>
            <option value="">All Authors</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={compactSelect}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasActiveFilters && (
            <Button size="sm" variant="outline" onClick={() => { setSort("popular"); setAuthorFilter(""); setCategoryFilter(""); setSearchQuery(""); }} style={{ fontSize: "12px", padding: "4px 10px" }}>
              Reset
            </Button>
          )}
        </div>
      )}

      {loading ? <Loading /> : fetchError ? <EmptyState>Could not load books: {fetchError}</EmptyState> : sortedBooks.length === 0 ? <EmptyState>No books match your filters.</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(1) }}>
          {sortedBooks.map(book => {
            const rt = ratings[book.id];
            const avgRating = rt ? num(rt.avg_rating) : 0;
            const ratingCount = rt ? num(rt.rating_count) : 0;
            const salesCount = salesCounts[book.id] || 0;
            return (
              <div key={book.id} onClick={() => navigate(`/book/${book.id}`)} style={{
                display: "flex", gap: h.space(2), padding: `${h.space(2)} 0`, cursor: "pointer",
                borderBottom: `1px solid ${h.color.lineSoft}`, transition: "background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = custCardBg === h.color.surface ? h.color.surfaceAlt : custCardBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                {book.cover_image_url ? (
                  <img src={book.cover_image_url} alt={book.title} style={{ width: 90, height: 120, objectFit: "cover", borderRadius: h.radius.sm, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 90, height: 120, background: h.color.surfaceAlt, borderRadius: h.radius.sm, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "11px", color: h.color.inkMuted, textAlign: "center", padding: 4 }}>No cover</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: h.space(2) }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", color: custFontColor, margin: 0, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.title}</h3>
                        <div style={{ fontSize: "13px", color: h.color.inkMuted, marginTop: 2, fontFamily: custFontFam }}>{book.author || "Unknown author"}{book.category ? ` · ${book.category}` : ""}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "18px", color: h.color.accent }}>${num(book.price).toFixed(2)}</div>
                        <Button size="sm" style={{ marginTop: 4 }}>Buy Now</Button>
                      </div>
                    </div>
                    {book.description && (
                      <p style={{ fontSize: "13px", color: h.color.inkSoft, marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{book.description}</p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                      {ratingCount > 0 && book.show_reviews !== false && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <RatingStars rating={avgRating} size={13} />
                          <span style={{ fontSize: "12px", color: h.color.inkMuted }}>{avgRating.toFixed(1)} ({ratingCount})</span>
                        </div>
                      )}
                      {salesCount > 0 && book.show_sales_count !== false && (
                        <span style={{ fontSize: "12px", color: h.color.inkMuted }}>{salesCount} sold</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
