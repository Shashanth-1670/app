import React, { useState } from "react";
import { Logo3D } from "./Logo3D";
import { Button } from "../components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Menu, LogOut, LayoutDashboard, Truck, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, clearAuth } from "../lib/api";
import { AboutModal, HowItWorksModal, TermsModal } from "./InfoModals";

export const Header = ({ onRequestPickup }) => {
  const [about, setAbout] = useState(false);
  const [how, setHow] = useState(false);
  const [terms, setTerms] = useState(false);
  const user = getUser();
  const navigate = useNavigate();

  const logout = () => {
    clearAuth();
    navigate("/");
    window.location.reload();
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-black/60 border-b border-white/10" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-3 flex items-center justify-between">
        <Link to="/" data-testid="header-logo-link"><Logo3D /></Link>

        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => setAbout(true)} data-testid="menu-about" className="px-3 py-2 text-sm text-white/80 hover:text-[#00FF66] transition-colors">About Us</button>
          <button onClick={() => setHow(true)} data-testid="menu-how" className="px-3 py-2 text-sm text-white/80 hover:text-[#00FF66] transition-colors">How It Works</button>
          <button onClick={() => setTerms(true)} data-testid="menu-terms" className="px-3 py-2 text-sm text-white/80 hover:text-[#00FF66] transition-colors">Terms &amp; Conditions</button>
          <Link to="/seller" data-testid="header-seller-link" className="px-3 py-2 text-sm text-white/80 hover:text-[#00FF66] transition-colors inline-flex items-center gap-1"><User className="h-4 w-4"/>Seller</Link>
          <Link to="/collector" data-testid="header-collector-link" className="px-3 py-2 text-sm text-white/80 hover:text-[#00FF66] transition-colors inline-flex items-center gap-1"><Truck className="h-4 w-4"/>Collector</Link>
          {user && (
            <Link to={user.role === "collector" ? "/collector" : "/seller"} data-testid="header-dashboard-link" className="px-3 py-2 text-sm text-white/80 hover:text-[#00FF66] transition-colors inline-flex items-center gap-1"><LayoutDashboard className="h-4 w-4"/>Dashboard</Link>
          )}
          {user ? (
            <Button variant="ghost" size="sm" onClick={logout} data-testid="header-logout-btn" className="text-white/80 hover:text-[#00FF66]"><LogOut className="h-4 w-4 mr-1"/>Logout</Button>
          ) : (
            onRequestPickup && (
              <Button onClick={onRequestPickup} data-testid="header-request-pickup-btn" className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold px-5">
                Request Pickup
              </Button>
            )
          )}
        </div>

        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="mobile-menu-toggle" className="text-white"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[#0a0a0a] border-white/10 text-white">
              <SheetHeader><SheetTitle className="text-white">Menu</SheetTitle></SheetHeader>
              <div className="flex flex-col gap-2 mt-6">
                <button onClick={() => setAbout(true)} data-testid="mobile-menu-about" className="text-left py-3 border-b border-white/10">About Us</button>
                <button onClick={() => setHow(true)} data-testid="mobile-menu-how" className="text-left py-3 border-b border-white/10">How It Works</button>
                <button onClick={() => setTerms(true)} data-testid="mobile-menu-terms" className="text-left py-3 border-b border-white/10">Terms &amp; Conditions</button>
                <Link to="/seller" data-testid="mobile-menu-seller" className="text-left py-3 border-b border-white/10">Seller Portal</Link>
                <Link to="/collector" data-testid="mobile-menu-collector" className="text-left py-3 border-b border-white/10">Collector Portal</Link>
                {user ? (
                  <>
                    <Link to={user.role === "collector" ? "/collector" : "/seller"} data-testid="mobile-menu-dashboard" className="text-left py-3 border-b border-white/10">Dashboard</Link>
                    <button onClick={logout} data-testid="mobile-menu-logout" className="text-left py-3 text-[#00FF66]">Logout</button>
                  </>
                ) : onRequestPickup ? (
                  <Button onClick={onRequestPickup} data-testid="mobile-request-pickup-btn" className="mt-4 rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">Request Pickup</Button>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <AboutModal open={about} onOpenChange={setAbout} />
      <HowItWorksModal open={how} onOpenChange={setHow} />
      <TermsModal open={terms} onOpenChange={setTerms} />
    </header>
  );
};
