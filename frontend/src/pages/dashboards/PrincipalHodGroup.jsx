import { useEffect, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { listMessages, postMessage } from "../../api/messages";
import { useAuth } from "../../context/AuthContext";

const GROUP = "principal-hod";

function toFeedItem(m) {
  return { id: m.id, from: m.from_name, text: m.text, time: new Date(m.created_at).toLocaleString(), clicks: 0, total: 1, link: m.link, attachment: m.attachment };
}

export default function PrincipalHodGroup() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listMessages(GROUP)
      .then((data) => { if (!cancelled) setItems(data.map(toFeedItem)); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load messages."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSend = async (text) => {
    try {
      await postMessage({ group: GROUP, text });
    } catch {
      setError("Message may not have been saved — check your connection.");
    }
  };

  return (
    <AppShell title="HOD group" subtitle="Institution → Department heads">
      <div style={{ maxWidth: 640 }}>
        <CommonGroupFeed key={GROUP}
          items={items}
          trackClicks
          allowPost
          posterName={user ? `${user.name} (You)` : "You"}
          title="Principal · HOD circle"
          groupName="All department heads"
          onSend={handleSend}
          loading={loading}
          error={error}
        />
      </div>
    </AppShell>
  );
}
