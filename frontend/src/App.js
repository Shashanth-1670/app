import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import Seller from "@/pages/Seller";
import Collector from "@/pages/Collector";
import Admin from "@/pages/Admin";
import { CallProvider } from "@/components/CallProvider";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" richColors closeButton toastOptions={{ style: { background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" } }} />
        <CallProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/seller" element={<Seller />} />
            <Route path="/collector" element={<Collector />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </CallProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
