import { useEffect, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { GlassCard } from "../../components/common/Primitives";
import { listMessages, postMessage } from "../../api/messages";
import { useAuth } from "../../context/AuthContext";
import { ShieldAlert } from "lucide-react";

function toFeedItem(m) {
  return { id: m.id, from: m.from_name, text: m.text, time: new Date(m.created_at).toLocaleString(), clicks: 0, total: 1, link: m.link, attachment: m.attachment };
}

export default function StudentGroup() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const groupId = user?.class_advisor_id ? `class-${user.class_advisor_id}` : null;

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    listMessages(groupId)
      .then((data) => { if (!cancelled) setItems(data.map(toFeedItem)); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load messages."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId]);

  const handleSend = async (text) => {
    if (!groupId) return;
    try {
      await postMessage({ group: groupId, text });
      // Refresh after send
      const data = await listMessages(groupId);
      setItems(data.map(toFeedItem));
    } catch {
      setError("Message may not have been saved — check your connection.");
    }
  };

  return (
    <AppShell title="Class Common Group" subtitle="Broadcasting messages — scoped to your assigned class">
      <div style={{ maxWidth: 640 }}>
        {!groupId ? (
          <GlassCard style={{ padding: 24, textAlign: "center" }}>
            <ShieldAlert size={32} color="var(--accent-amber)" style={{ margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>Not Assigned to a Class Yet</h3>
            <p style={{ fontSize: 13, color: "var(--text-lo)", lineHeight: 1.6, margin: 0 }}>
              You are registered, but your Class Advisor hasn't mapped you into a class roster yet.
              Once your Class Advisor adds you, your class group messages will appear here.
            </p>
          </GlassCard>
        ) : (
          <CommonGroupFeed
            items={items}
            title={`${user?.dept || "Class"} · Student Circle`}
            allowPost
            posterName={user?.name || "You"}
            onSend={handleSend}
            loading={loading}
            error={error}
          />
        )}
      </div>
    </AppShell>
  );
}
