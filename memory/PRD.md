# Smart Scrap - PRD

## Original Problem
Build a responsive full-stack web application "Smart Scrap" — a platform that converts household scrap into money by connecting sellers with local collectors. Vibrant green eco-tech aesthetic, 3D animated logo, hero + metrics, seller auth+pickup flow with 2-step captcha, real-time collector broadcast, masked calling, in-built navigation, seller/collector analytics dashboards, hidden admin portal via footer lock icon with passkey 8762, auto-expiry of unaccepted orders in 24h.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT auth (30d), bcrypt passwords. Admin JWT via passkey (6h). Auto-purge stale pending orders on `/orders/feed` and `/admin/orders`.
- **Frontend**: React 19 + Tailwind + Shadcn UI + Framer Motion + Sonner + Lucide. Dark theme with `#00FF66` primary. Outfit (display) + Manrope (body).
- **Routes**: `/` Landing, `/seller` Dashboard, `/collector` Dashboard, `/admin` Master Panel.
- **Polling**: 4-5s polling for collector feed, seller orders, admin data.

## Personas
- **Seller**: household with scrap. Registers, books pickup, tracks orders/earnings.
- **Collector**: local scrap hub. Toggles online, sees live feed, accepts/rejects/completes.
- **Admin**: platform operator. Hidden entry via footer lock + passkey 8762.

## Implemented (2026-08)
- 3D animated logo with continuously rotating recycle icon
- Landing page: hero video overlay, metrics bar, feature bento (masked calling + navigation + broadcast + payouts), 4-step how-it-works, final CTA
- Header w/ About / How It Works / Terms modals; responsive slide-out mobile menu
- Seller auth (login/register) w/ 2-step math captcha
- Pickup Order Form (category dropdown, weight, notes) + auto-fill from profile
- Real-time broadcast to online collectors
- Collector dashboard: Online/Offline switch, Incoming Feed (masked mobile), Accept/Reject/Masked Call buttons, Active Pickups w/ Navigate (OpenStreetMap) & Complete
- Auto-purge orders older than 24h
- Seller analytics (orders, weight, earnings) after 1+ completion
- Collector analytics (pickups, volume, profit) after 1+ completion
- Public metrics endpoint (1000+ tons, 100+ customers, 50+ collectors baselines)
- Footer with hidden Lock icon → passkey modal → `/admin`
- Admin Master Panel: summary cards, tabs for Orders / Users / Collectors, live refresh

## Backlog (P1/P2)
- Real Twilio masked calling integration (currently MOCKED — shows toast + masked number)
- Google Maps embedded turn-by-turn (currently opens OpenStreetMap in new tab)
- WebSocket-based push (currently polling every 4-5s)
- Live pricing engine per city / category negotiation
- Referral program
- Email/SMS notifications on order accept
