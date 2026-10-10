import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Card, Loading, EmptyState, RatingStars, Textarea, Input, num } from "../components";
import { useSEO } from "../seo";
import { downloadBlob } from "../qr-utils";
import { getReferralCookie, buildGumroadCheckoutUrl } from "../referral";

const REVIEWER_TOKEN_KEY = "litora_reviewer_token";
function getReviewerToken(): string {
  let token = localStorage.getItem(REVIEWER_TOKEN_KEY);
  if (!token) {
    token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(REVIEWER_TOKEN_KEY, token);
  }
  return token;
}

export function BookDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState<any>(null);
  const [rating, setRating] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRating, setUserRating] = useState(0);
  const [userReview, setUserReview] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  useSEO({ title: book ? `${book.title} - Litora` : "Book - Litora", description: book?.description, path: `/book/${id}`, type: "article", jsonLd: book ? {
    "@context": "https://schema.org", "@type": "Book",
    name: book.title, author: book.author, description: book.description,
    offers: { "@type": "Offer", price: num(book.price).toFixed(2), priceCurrency: "USD" },
  } : undefined });

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: bookData } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
      setBook(bookData);
      if (bookData) {
        const { data: rt } = await supabase.from("book_rating_stats").select("*").eq("book_id", id).maybeSingle();
        setRating(rt);
        const { data: rv } = await supabase.from("book_ratings").select("*").eq("book_id", id).order("created_at", { ascending: false });
        setReviews(rv || []);
      }
      setLoading(false);
    })();
  }, [id]);

  const submitReview = async () => {
    if (userRating === 0) return;
    setSubmitting(true);
    const token = getReviewerToken();
    await supabase.from("book_ratings").upsert({
      book_id: id, rating: userRating, review_text: userReview.trim() || null,
      reviewer_name: reviewerName.trim() || null, reviewer_token: token,
    }, { onConflict: "book_id,reviewer_token" });
    const { data: rt } = await supabase.from("book_rating_stats").select("*").eq("book_id", id).maybeSingle();
    setRating(rt);
    const { data: rv } = await supabase.from("book_ratings").select("*").eq("book_id", id).order("created_at", { ascending: false });
    setReviews(rv || []);
    setUserRating(0); setUserReview(""); setReviewerName("");
    setSubmitting(false);
  };

  if (loading) return <Layout><Loading /></Layout>;
  if (!book) return <Layout><EmptyState>Book not found. <Button variant="outline" onClick={() => navigate("/")}>Back home</Button></EmptyState></Layout>;

  const avgRating = rating ? num(rating.avg_rating) : 0;
  const ratingCount = rating ? num(rating.rating_count) : 0;

  return (
    <Layout>
      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: h.color.inkMuted, fontSize: "14px", cursor: "pointer", marginBottom: h.space(2), padding: 0 }}>← Back</button>
      <div style={{ display: "flex", gap: h.space(4), flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          {book.cover_image_url ? (
            <img src={book.cover_image_url} alt={book.title} style={{ width: 240, height: 320, objectFit: "cover", borderRadius: h.radius.md }} />
          ) : (
            <div style={{ width: 240, height: 320, background: h.color.surfaceAlt, borderRadius: h.radius.md, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: h.color.inkMuted }}>No cover</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "28px", color: h.color.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.02em" }}>{book.title}</h1>
          <div style={{ fontSize: "16px", color: h.color.inkMuted, marginTop: 4 }}>by {book.author || "Unknown author"}</div>
          {ratingCount > 0 && book.show_reviews !== false && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: h.space(2) }}>
              <RatingStars rating={avgRating} />
              <span style={{ fontSize: "14px", color: h.color.inkMuted }}>{avgRating.toFixed(1)} ({ratingCount} {ratingCount === 1 ? "review" : "reviews"})</span>
            </div>
          )}
          <div style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "28px", color: h.color.accent, marginTop: h.space(2) }}>${num(book.price).toFixed(2)}</div>
          <div style={{ marginTop: h.space(3), display: "flex", gap: h.space(2), flexWrap: "wrap" }}>
            <Button onClick={() => {
              const ref = getReferralCookie();
              const url = buildGumroadCheckoutUrl(book.gumroad_url, ref?.offer || null);
              window.open(url, "_blank");
            }}>Buy Now</Button>
            {book.sample_pdf_url && (
              <Button variant="outline" onClick={() => downloadBlob(book.sample_pdf_url, `${book.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-sample.pdf`)}>Download Sample PDF</Button>
            )}
          </div>
          {book.description && (
            <div style={{ marginTop: h.space(3) }}>
              <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "16px", color: h.color.ink, margin: `0 0 ${h.space(1)}` }}>About this book</h3>
              <p style={{ fontSize: "15px", color: h.color.inkSoft, lineHeight: 1.6, margin: 0 }}>{book.description}</p>
            </div>
          )}
        </div>
      </div>

      {book.sample_text && (
        <Card style={{ marginTop: h.space(4) }}>
          <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", color: h.color.ink, margin: `0 0 ${h.space(2)}` }}>Sample</h3>
          <div style={{ fontSize: "15px", color: h.color.inkSoft, lineHeight: 1.7, whiteSpace: "pre-wrap", fontStyle: "italic" }}>{book.sample_text}</div>
        </Card>
      )}

      {book.show_reviews !== false && (
      <div style={{ marginTop: h.space(4) }}>
        <h3 style={{ fontFamily: h.font.serif, fontWeight: 600, fontSize: "18px", color: h.color.ink, margin: `0 0 ${h.space(2)}` }}>Reviews</h3>
        <Card style={{ marginBottom: h.space(2) }}>
          <div style={{ display: "flex", flexDirection: "column", gap: h.space(2) }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <span key={i} onClick={() => setUserRating(i)} onMouseEnter={() => setHoverRating(i)} onMouseLeave={() => setHoverRating(0)}
                  style={{ fontSize: 24, cursor: "pointer", color: i <= (hoverRating || userRating) ? "#e0a82e" : h.color.line }}>★</span>
              ))}
            </div>
            <Input placeholder="Your name (optional)" value={reviewerName} onChange={e => setReviewerName(e.target.value)} />
            <Textarea placeholder="Write a review (optional)" value={userReview} onChange={e => setUserReview(e.target.value)} rows={3} />
            <Button size="sm" onClick={submitReview} disabled={submitting || userRating === 0}>{submitting ? "Submitting..." : "Submit Review"}</Button>
          </div>
        </Card>
        {reviews.length === 0 ? <EmptyState>No reviews yet. Be the first!</EmptyState> : reviews.map(r => (
          <Card key={r.id} style={{ marginBottom: h.space(1) }}>
            <div style={{ display: "flex", alignItems: "center", gap: h.space(2) }}>
              <RatingStars rating={num(r.rating)} size={14} />
              {r.reviewer_name && <span style={{ fontSize: "13px", fontWeight: 600, color: h.color.ink }}>{r.reviewer_name}</span>}
              <span style={{ fontSize: "13px", color: h.color.inkMuted }}>{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.review_text && <p style={{ fontSize: "14px", color: h.color.inkSoft, marginTop: h.space(1), lineHeight: 1.5, margin: 0 }}>{r.review_text}</p>}
          </Card>
        ))}
      </div>
      )}
    </Layout>
  );
}
