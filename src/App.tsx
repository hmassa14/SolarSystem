import { Link, Route, Routes } from "react-router-dom";
import IdeasBoard from "./pages/IdeasBoard.tsx";
import Nest from "./pages/Nest.tsx";
import HealthBadge from "./components/HealthBadge.tsx";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">◉</span> StoryNest
        </Link>
        <HealthBadge />
      </header>
      <Routes>
        <Route path="/" element={<IdeasBoard />} />
        <Route path="/nest/:id" element={<Nest />} />
        <Route path="*" element={<IdeasBoard />} />
      </Routes>
    </div>
  );
}
