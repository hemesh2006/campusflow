import { useAuth } from "../../context/AuthContext";
import AppShell from "../../components/layout/AppShell";
import ProfileForm from "../../components/common/ProfileForm";
import TelegramConnect from "../../components/common/TelegramConnect";
import { updateMyProfile } from "../../api/users";

export default function AccountNotifications() {
  const { user, setUser } = useAuth();

  const handleSave = async (patch) => {
    const updated = await updateMyProfile(patch);
    if (setUser) setUser(updated);
  };

  return (
    <AppShell title="Profile & notifications" subtitle="Personal details and where CampusFlow can reach you">
      <div className="grid grid-main-side">
        <ProfileForm user={user} onSave={handleSave} />
        <TelegramConnect />
      </div>
    </AppShell>
  );
}
