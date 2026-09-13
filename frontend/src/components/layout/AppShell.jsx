import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import AssistantChat from "../common/AssistantChat";

export default function AppShell({ title, subtitle, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="app-main">
        <Topbar title={title} subtitle={subtitle} onMenuClick={() => setMobileOpen(true)} />
        <main className="app-content">{children}</main>
      </div>
      <AssistantChat />
    </div>
  );
}
