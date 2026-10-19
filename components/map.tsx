"use client";
import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { AppConfig, Avatar, House } from "@/lib/types";

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}
const markerImage = (house: House) =>
  `/art/${house.status === "PENDING" ? "pending-house" : house.status === "ACTIVE" ? "haunted-house" : "tombstone"}.svg`;
export function EventMap({
  houses,
  config,
  selected,
  onSelect,
  avatar,
  position,
  focus,
}: {
  houses: House[];
  config: AppConfig;
  selected?: string;
  onSelect: (id: string) => void;
  avatar: Avatar;
  position: Position | null;
  focus: number;
}) {
  if (config.demo)
    return (
      <IllustratedMap
        houses={houses}
        selected={selected}
        onSelect={onSelect}
        avatar={avatar}
        position={position}
      />
    );
  return (
    <GoogleEventMap
      houses={houses}
      config={config}
      selected={selected}
      onSelect={onSelect}
      avatar={avatar}
      position={position}
      focus={focus}
    />
  );
}
function IllustratedMap({
  houses,
  selected,
  onSelect,
  avatar,
  position,
}: Omit<Parameters<typeof EventMap>[0], "config" | "focus">) {
  return (
    <div
      className="illustrated-map"
      aria-label="Mapa ilustrativo de demonstração, sem endereços reais"
    >
      <svg
        viewBox="0 0 1200 850"
        preserveAspectRatio="xMidYMid slice"
        className="map-drawing"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="mapgrid"
            width="130"
            height="108"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-13)"
          >
            <rect width="130" height="108" fill="#e9e6da" />
            <rect x="15" y="14" width="99" height="79" rx="9" fill="#dfddce" />
            <path
              d="M27 25h23v22H27zm39 0h34v22H66zM28 59h32v21H28zm48-2h23v25H76z"
              fill="#d2d1c2"
            />
            <path
              d="M0 0h130v108"
              fill="none"
              stroke="#faf7ed"
              strokeWidth="13"
            />
          </pattern>
          <filter id="park-shadow">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>
        <rect width="1200" height="850" fill="url(#mapgrid)" />
        <path
          d="M840-90C620 70 980 195 850 355S720 570 940 690s40 200 70 250"
          stroke="#c2d5d4"
          strokeWidth="67"
          fill="none"
        />
        <path
          d="M840-90C620 70 980 195 850 355S720 570 940 690s40 200 70 250"
          stroke="#d3e4e0"
          strokeWidth="45"
          fill="none"
        />
        <path
          d="M285 180l190-40 100 89-34 178-189 40-97-118z"
          fill="#cfdbc1"
          stroke="#faf7ed"
          strokeWidth="13"
        />
        <path
          d="M286 206l213 137m-175-168l172 215"
          stroke="#e5e9d4"
          strokeWidth="7"
        />
        <g fill="#b6cba8">
          <circle cx="343" cy="232" r="19" />
          <circle cx="446" cy="204" r="23" />
          <circle cx="483" cy="288" r="18" />
          <circle cx="376" cy="362" r="25" />
          <circle cx="317" cy="321" r="20" />
        </g>
        <path
          d="M-100 670L1320 360M570-100L730 950"
          fill="none"
          stroke="#d7d0be"
          strokeWidth="34"
        />
        <path
          d="M-100 670L1320 360M570-100L730 950"
          fill="none"
          stroke="#fff9e9"
          strokeWidth="25"
        />
        <path
          d="M820 421l80-17M842 642l68 39"
          stroke="#b8b6ac"
          strokeWidth="38"
        />
        <path
          d="M820 421l80-17M842 642l68 39"
          stroke="#fff9e9"
          strokeWidth="24"
        />
        <g
          fill="#8c8d7e"
          fontFamily="Arial,sans-serif"
          fontSize="12"
          fontWeight="500"
        >
          <text x="392" y="301" textAnchor="middle">
            PARQUE LUA NOVA
          </text>
          <text transform="translate(408 553) rotate(-12)">
            RUA DAS ABÓBORAS
          </text>
          <text transform="translate(648 244) rotate(79)">
            ALAMEDA DOS FANTASMAS
          </text>
          <text transform="translate(980 240) rotate(-13)">
            TRAVESSA DO MORCEGO
          </text>
          <text transform="translate(178 704) rotate(-13)">
            RUA DAS TRAVESSURAS
          </text>
          <text x="952" y="765">
            JARDIM ENCANTADO
          </text>
        </g>
      </svg>
      <div className="demo-markers">
        {houses.map((h) => (
          <button
            key={h.id}
            className={`house-marker ${h.status === "EMPTY" ? "empty" : ""} ${selected === h.id ? "selected" : ""}`}
            style={{
              left: `${50 + ((h.lng ?? -49.2733) + 49.2733) * 6900}%`,
              top: `${49 - ((h.lat ?? -25.4284) + 25.4284) * 11000}%`,
            }}
            onClick={() => onSelect(h.id)}
            aria-label={`${h.name}: ${h.status === "PENDING" ? "aguardando ativação" : h.status === "ACTIVE" ? "tem doces" : "doces acabaram"}`}
          >
            <img src={markerImage(h)} alt="" />
            <span className="marker-label">{h.name}</span>
          </button>
        ))}
        {position && (
          <div
            className="you-marker demo-you"
            title="Seu personagem · posição ilustrativa"
          >
            <img src={`/art/avatar-${avatar}.svg`} alt="Seu personagem" />
            <span>VOCÊ · PRÉVIA</span>
          </div>
        )}
      </div>
      <span className="map-demo-label">
        PRÉVIA LOCAL · MAPA E ENDEREÇOS FICTÍCIOS
      </span>
    </div>
  );
}
function GoogleEventMap({
  houses,
  config,
  selected,
  onSelect,
  avatar,
  position,
  focus,
}: Parameters<typeof EventMap>[0]) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<google.maps.Map | null>(null);
  const markers = useRef(
      new Map<string, google.maps.marker.AdvancedMarkerElement>(),
    ),
    userMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null),
    accuracy = useRef<google.maps.Circle | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const fitted = useRef(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!config.mapsKey || !config.mapId) {
      setError(
        "O Google Maps ainda não foi configurado. A organização precisa informar a chave e o Map ID.",
      );
      return;
    }
    let cancelled = false;
    const previousAuth = window.gm_authFailure;
    window.gm_authFailure = () =>
      setError(
        "A chave do Google Maps não foi autorizada. A organização precisa conferir o faturamento e as restrições da chave.",
      );
    setOptions({
      key: config.mapsKey,
      v: "weekly",
      language: "pt-BR",
      region: "BR",
    });
    void Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(([maps]) => {
        if (cancelled || !container.current) return;
        const { Map: GoogleMap } = maps as google.maps.MapsLibrary;
        map.current = new GoogleMap(container.current, {
          center: config.center,
          zoom: 16,
          mapId: config.mapId,
          colorScheme: google.maps.ColorScheme.DARK,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          zoomControl: true,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Não foi possível carregar o Google Maps. Confira sua conexão e tente novamente.",
          );
      });
    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuth;
      for (const m of markers.current.values()) m.map = null;
      markers.current.clear();
      if (userMarker.current) userMarker.current.map = null;
      accuracy.current?.setMap(null);
      map.current = null;
      userMarker.current = null;
      accuracy.current = null;
      fitted.current = false;
    };
  }, [config]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const visible = new Set(houses.map((h) => h.id));
    for (const [id, marker] of markers.current)
      if (!visible.has(id)) {
        marker.map = null;
        markers.current.delete(id);
      }
    for (const h of houses) {
      if (h.lat == null || h.lng == null) continue;
      let marker = markers.current.get(h.id);
      if (!marker) {
        const button = document.createElement("button");
        button.className = "google-house-marker";
        button.onclick = () => onSelectRef.current(h.id);
        const img = document.createElement("img");
        button.append(img);
        marker = new google.maps.marker.AdvancedMarkerElement({
          map: map.current,
          position: { lat: h.lat, lng: h.lng },
          title: h.name,
        });
        marker.append(button);
        markers.current.set(h.id, marker);
      }
      marker.position = { lat: h.lat, lng: h.lng };
      marker.title = h.name;
      const button = marker.querySelector("button")!;
      button.setAttribute(
        "aria-label",
        `${h.name}: ${h.status === "PENDING" ? "aguardando ativação" : h.status === "ACTIVE" ? "tem doces" : "doces acabaram"}`,
      );
      button.querySelector("img")!.src = markerImage(h);
    }
    if (!fitted.current && houses.some((h) => h.lat != null && h.lng != null)) {
      const bounds = new google.maps.LatLngBounds();
      houses.forEach((h) => {
        if (h.lat != null && h.lng != null)
          bounds.extend({ lat: h.lat, lng: h.lng });
      });
      map.current.fitBounds(bounds, {
        top: 120,
        left: window.innerWidth > 760 ? 390 : 40,
        right: 80,
        bottom: 100,
      });
      fitted.current = true;
    }
  }, [houses, ready]);
  useEffect(() => {
    if (!map.current || !ready || !position) return;
    if (!userMarker.current) {
      const img = document.createElement("img");
      img.className = "google-user-icon";
      userMarker.current = new google.maps.marker.AdvancedMarkerElement({
        map: map.current,
        title: "Sua localização",
        zIndex: 100,
      });
      userMarker.current.append(img);
    }
    userMarker.current.position = position;
    userMarker.current.querySelector("img")!.src = `/art/avatar-${avatar}.svg`;
    if (!accuracy.current)
      accuracy.current = new google.maps.Circle({
        map: map.current,
        fillColor: "#b598e9",
        fillOpacity: 0.12,
        strokeColor: "#b598e9",
        strokeOpacity: 0.4,
        strokeWeight: 1,
        clickable: false,
      });
    accuracy.current.setCenter(position);
    accuracy.current.setRadius(position.accuracy);
  }, [position, avatar, ready]);
  useEffect(() => {
    if (position && map.current && focus) map.current.panTo(position);
  }, [focus, position, ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    for (const [id, m] of markers.current) {
      m.zIndex = id === selected ? 20 : 1;
      m.querySelector("button")?.classList.toggle("selected", id === selected);
    }
    const h = houses.find((h) => h.id === selected);
    if (h?.lat != null && h.lng != null) {
      map.current.panTo({ lat: h.lat, lng: h.lng });
      map.current.panBy(
        window.innerWidth > 760 ? 100 : 0,
        window.innerWidth > 760 ? 0 : 90,
      );
    }
  }, [selected, ready]);
  return (
    <div className="real-map">
      <div ref={container} className="google-map" />
      {(!ready || error) && (
        <div className="map-loading">
          <span className="eyebrow">GOOGLE MAPS</span>
          <h2>{error ? "O mapa não carregou" : "Abrindo o bairro…"}</h2>
          <p>{error || "Preparando uma noite de doçuras e travessuras."}</p>
          {error && (
            <button
              className="button secondary"
              onClick={() => window.location.reload()}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}
