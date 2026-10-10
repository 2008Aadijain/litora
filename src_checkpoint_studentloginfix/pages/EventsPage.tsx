import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { theme as h } from "../theme";
import { Layout, Button, Loading, EmptyState, Card, Modal, useAuth } from "../components";
import { useSEO } from "../seo";

export function EventsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinEvent, setJoinEvent] = useState<any>(null);
  const [showFormStep, setShowFormStep] = useState(false);
  const [showRequestSent, setShowRequestSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<any>(null);

  useSEO({ title: "Events & Programs - Litora Bookstore Marketplace", description: "Discover events and programs on Litora bookstore marketplace. Join community programs, connect with independent authors, and grow your indie bookstore revenue.", path: "/events" });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("events").select("*").order("created_at", { ascending: false });
      if (!error) setEvents(data || []);
      setLoading(false);
    })();
  }, []);

  const handleJoinNow = async (event: any) => {
    if (!session) {
      setJoinEvent(event);
      return;
    }
    setSubmitting(true);
    const { data: existing } = await supabase
      .from("event_requests")
      .select("id, status")
      .eq("event_id", event.id)
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      setExistingRequest(existing);
      if (existing.status === "approved") {
        navigate("/student/dashboard");
        return;
      }
      if (existing.status === "pending") {
        setShowFormStep(true);
        setJoinEvent(event);
        setSubmitting(false);
        return;
      }
    }

    setJoinEvent(event);
    setShowFormStep(true);
    setSubmitting(false);
  };

  const sendRequest = async () => {
    if (!session || !joinEvent) return;
    setSubmitting(true);
    const { error: insertErr } = await supabase.from("event_requests").insert({
      event_id: joinEvent.id,
      user_id: session.user.id,
      user_email: session.user.email || "",
      status: "pending",
    });
    if (insertErr) {
      const { error: upsertErr } = await supabase.from("event_requests").upsert({
        event_id: joinEvent.id,
        user_id: session.user.id,
        user_email: session.user.email || "",
        status: "pending",
      }, { onConflict: "event_id,user_id" });
      if (upsertErr) { alert("Could not submit request. Please try again."); setSubmitting(false); return; }
    }
    setShowFormStep(false);
    setShowRequestSent(true);
    setSubmitting(false);
  };

  const youtubeEmbed = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
  };

  return (
    <Layout>
      <div style={{ marginBottom: h.space(4) }}>
        <h1 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "32px", color: h.color.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.02em" }}>Events & Programs</h1>
        <p style={{ fontSize: "16px", color: h.color.inkMuted, marginTop: h.space(1), lineHeight: 1.5 }}>Discover events and programs on Litora bookstore marketplace. Join community programs, connect with independent authors, and grow your indie bookstore revenue with Litora.</p>
      </div>

      {loading ? <Loading /> : events.length === 0 ? <EmptyState>No events available right now. Check back soon!</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: h.space(4) }}>
          {events.map(event => (
            <Card key={event.id} style={{ padding: 0, overflow: "hidden" }}>
              {event.image_url && (
                <img src={event.image_url} alt={`${event.title} — event on Litora bookstore marketplace`} loading="lazy" style={{ width: "100%", height: 240, objectFit: "cover" }} />
              )}
              <div style={{ padding: h.space(4) }}>
                <h2 style={{ fontFamily: h.font.serif, fontWeight: 700, fontSize: "24px", color: h.color.ink, margin: 0, lineHeight: 1.2 }}>{event.title}</h2>
                {event.description && <p style={{ fontSize: "15px", color: h.color.inkSoft, lineHeight: 1.6, marginTop: h.space(2) }}>{event.description}</p>}

                {event.youtube_url && (
                  <div style={{ marginTop: h.space(3) }}>
                    {event.video_description && <p style={{ fontSize: "14px", color: h.color.inkMuted, marginBottom: h.space(2) }}>{event.video_description}</p>}
                    <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: h.radius.md, overflow: "hidden" }}>
                      <iframe src={youtubeEmbed(event.youtube_url)} title={event.title} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} allowFullScreen />
                    </div>
                  </div>
                )}

                {event.join_form_url && (
                  <div style={{ marginTop: h.space(3) }}>
                    <Button onClick={() => handleJoinNow(event)} disabled={submitting}>{submitting ? "Processing..." : "Join Now"}</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Login prompt modal */}
      {joinEvent && !showFormStep && (
        <Modal onClose={() => setJoinEvent(null)} title="Login Required">
          <p style={{ fontSize: "15px", color: h.color.inkSoft, lineHeight: 1.6 }}>You need to be logged in to join this event. Please log in or sign up to continue.</p>
          <div style={{ display: "flex", gap: h.space(2), marginTop: h.space(3), flexWrap: "wrap" }}>
            <Button onClick={() => navigate("/student/login")}>Student Login / Sign Up</Button>
            <Button variant="outline" onClick={() => navigate("/seller/login")}>Seller Login</Button>
            <Button variant="outline" onClick={() => navigate("/author/login")}>Author Login</Button>
          </div>
        </Modal>
      )}

      {/* Form step modal — Step 1: fill Google Form, Step 2: Send Request */}
      {showFormStep && joinEvent && (
        <Modal onClose={() => { setShowFormStep(false); setJoinEvent(null); }} title={`Join: ${joinEvent.title}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: h.space(3) }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: h.color.accent, marginBottom: 6 }}>STEP 1</div>
              <p style={{ fontSize: "15px", color: h.color.inkSoft, lineHeight: 1.6 }}>First, fill out and submit the application form. Click the button below to open it in a new tab.</p>
              <Button size="sm" style={{ marginTop: h.space(2) }} onClick={() => window.open(joinEvent.join_form_url, "_blank")}>Open Application Form</Button>
            </div>
            <div style={{ borderTop: `1px solid ${h.color.lineSoft}`, paddingTop: h.space(3) }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: h.color.accent, marginBottom: 6 }}>STEP 2</div>
              <p style={{ fontSize: "15px", color: h.color.inkSoft, lineHeight: 1.6 }}>After you've submitted the form, click "Send Request" below. This sends your request to the admin for review.</p>
              <Button size="sm" style={{ marginTop: h.space(2) }} onClick={sendRequest} disabled={submitting}>{submitting ? "Sending..." : "Send Request"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Request sent confirmation */}
      {showRequestSent && (
        <Modal onClose={() => setShowRequestSent(false)} title="Request Sent">
          <p style={{ fontSize: "15px", color: h.color.inkSoft, lineHeight: 1.6 }}>Your request has been sent to the admin for review. You'll be notified within 72 hours whether you've been selected.</p>
          <Button onClick={() => setShowRequestSent(false)} style={{ marginTop: h.space(2) }}>Got it</Button>
        </Modal>
      )}
    </Layout>
  );
}
