import { Outlet, useNavigation } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./AppShell.css";

export default function AppShell() {
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  return (
    <div className="app-shell">
      {/* Top progress bar while navigating between pages */}
      {isNavigating && <div className="nav-progress" />}
      <Sidebar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}