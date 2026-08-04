import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation as NavIcon, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

// Fix default marker icons in webpack builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const greenIcon = new L.DivIcon({
  html: `<div style="background:#00FF66;border:3px solid #050505;box-shadow:0 0 12px rgba(0,255,102,0.7);width:16px;height:16px;border-radius:50%;"></div>`,
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const whiteIcon = new L.DivIcon({
  html: `<div style="background:#fff;border:3px solid #050505;width:14px;height:14px;border-radius:50%;"></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const FitBounds = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [40, 40] });
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
    }
  }, [points, map]);
  return null;
};

async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
  } catch (e) {}
  return null;
}

async function getRoute(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      return { coords, distance_km: data.routes[0].distance / 1000, duration_min: data.routes[0].duration / 60 };
    }
  } catch (e) {}
  return null;
}

export const MapCard = ({ pickupAddress, collectorAddress, testId = "map-card" }) => {
  const [pickup, setPickup] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const p = await geocode(pickupAddress);
      let o = collectorAddress ? await geocode(collectorAddress) : null;
      // Fallback origin: use browser geolocation if collector address didn't resolve
      if (!o && navigator.geolocation) {
        o = await new Promise((res) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => res({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Your location" }),
            () => res(null),
            { timeout: 5000 }
          );
        });
      }
      if (cancelled) return;
      setPickup(p);
      setOrigin(o);
      if (p && o) {
        const r = await getRoute(o, p);
        if (!cancelled) setRoute(r);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [pickupAddress, collectorAddress]);

  const points = [origin, pickup].filter(Boolean);
  const center = pickup || origin || { lat: 20.5937, lng: 78.9629 }; // India center fallback

  const openExternal = () => window.open(`https://www.openstreetmap.org/directions?from=${origin ? `${origin.lat},${origin.lng}` : ""}&to=${pickup ? `${pickup.lat},${pickup.lng}` : encodeURIComponent(pickupAddress)}`, "_blank");

  return (
    <div data-testid={testId} className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
      <div className="relative h-56 w-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-[5] bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-[#00FF66]"/>
          </div>
        )}
        {!pickup && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50 p-4 text-center z-[5] bg-black/40">
            Could not locate address. Use external directions.
          </div>
        )}
        <MapContainer center={[center.lat, center.lng]} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%", background: "#0a0a0a" }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          />
          {origin && <Marker position={[origin.lat, origin.lng]} icon={whiteIcon}><Popup>Your start</Popup></Marker>}
          {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon}><Popup>Pickup: {pickup.label?.slice(0, 60)}</Popup></Marker>}
          {route && <Polyline positions={route.coords} pathOptions={{ color: "#00FF66", weight: 4, opacity: 0.85 }} />}
          <FitBounds points={points} />
        </MapContainer>
      </div>
      <div className="p-3 flex items-center justify-between text-xs">
        <div className="text-white/70">
          {route ? (
            <span><span className="text-[#00FF66] font-semibold">{route.distance_km.toFixed(1)} km</span> · ~{Math.round(route.duration_min)} min</span>
          ) : (
            <span className="text-white/40">Turn-by-turn ready</span>
          )}
        </div>
        <Button data-testid={`${testId}-external-btn`} onClick={openExternal} size="sm" variant="outline" className="rounded-full border-white/15 bg-white/5 hover:bg-white/10 h-7 text-xs">
          <NavIcon className="h-3 w-3 mr-1"/>Directions <ExternalLink className="h-3 w-3 ml-1"/>
        </Button>
      </div>
    </div>
  );
};
