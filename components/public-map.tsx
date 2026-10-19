"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowRight,
  Candy,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Ghost,
  LocateFixed,
  MapPin,
  Search,
  Skull,
  Sparkles,
  X,
} from "lucide-react";
import { Header } from "./brand";
import { EventMap, type Position } from "./map";
import { api, time } from "@/lib/client";
import {
  avatarNames,
  fullAddress,
  type AppConfig,
  type Avatar,
  type House,
} from "@/lib/types";
export default function PublicMap() {
  const [config, setConfig] = useState<AppConfig | null>(null),
    [houses, setHouses] = useState<House[]>([]),
    [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string>();
  const [avatar, setAvatar] = useState<Avatar>("pumpkin"),
    [picker, setPicker] = useState(false),
    [position, setPosition] = useState<Position | null>(null),
    [locationError, setLocationError] = useState(""),
    [locating, setLocating] = useState(false),
    [focus, setFocus] = useState(0),
    [connected, setConnected] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const watch = useRef<number | null>(null),
    hasPosition = useRef(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<AppConfig>("/config"),
      api<{ houses: House[] }>("/houses"),
    ])
      .then(([c, s]) => {
        if (alive) {
          setConfig(c);
          setHouses(s.houses);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    try {
      const saved = localStorage.getItem("tot-avatar");
      if (saved && Object.hasOwn(avatarNames, saved))
        setAvatar(saved as Avatar);
    } catch {
      /* Storage may be disabled. */
    }
    const socket = io({ transports: ["websocket", "polling"] });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("public:state", (s: { houses: House[] }) => {
      if (alive) {
        setHouses(s.houses);
        setError("");
      }
    });
    const timer = setInterval(() => {
      if (!socket.connected && document.visibilityState === "visible")
        void api<{ houses: House[] }>("/houses")
          .then((s) => {
            if (alive) setHouses(s.houses);
          })
          .catch(() => {});
    }, 15000);
    return () => {
      alive = false;
      socket.disconnect();
      clearInterval(timer);
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    };
  }, []);
  const visible = useMemo(
    () =>
      houses.filter(
        (h) =>
          (filter === "ALL" || h.status === filter) &&
          `${h.name} ${fullAddress(h)}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
      ),
    [houses, filter, search],
  );
  const active = houses.filter((h) => h.status === "ACTIVE").length,
    chosen = visible.find((h) => h.id === selected);
  function locate() {
    setLocationError("");
    if (position) {
      setFocus((v) => v + 1);
      return;
    }
    if (!navigator.geolocation) {
      setLocationError(
        "Este navegador não oferece localização. Você pode continuar explorando o mapa.",
      );
      return;
    }
    setLocating(true);
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        });
        setLocating(false);
        if (!hasPosition.current) {
          setFocus((v) => v + 1);
          hasPosition.current = true;
        }
      },
      (e) => {
        setLocating(false);
        setLocationError(
          e.code === 1
            ? "Localização não autorizada. Libere a permissão no navegador ou explore o mapa normalmente."
            : "Não encontramos sua localização agora. Tente novamente ao ar livre.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }
  return (
    <div className="public-app">
      <Header />
      <main className="map-stage">
        {config ? (
          <EventMap
            houses={visible}
            config={config}
            selected={selected}
            onSelect={setSelected}
            avatar={avatar}
            position={position}
            focus={focus}
          />
        ) : (
          <div className="map-loading">
            <Ghost size={36} />
            <h2>{error || "O bairro está ganhando vida…"}</h2>
          </div>
        )}
        <aside
          className={`explore-panel ${collapsed ? "collapsed" : ""}`}
          aria-label="Encontrar casas"
        >
          <div className="panel-heading">
            <span className="eyebrow">
              <Sparkles size={13} /> DOÇURAS OU TRAVESSURAS?
            </span>
            <button
              className="icon-button mobile-only"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expandir casas" : "Recolher casas"}
            >
              {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
          <h1>
            Siga os sustos.
            <br />
            <span>Encontre os doces.</span>
          </h1>
          <p className="intro">
            A próxima doçura pode estar logo na esquina. Explore as casas do seu
            bairro.
          </p>
          <div className="live-summary">
            <span className="pulse" />
            <b>{active} casas com doces</b>
            <span className="live-word">
              {connected ? "AO VIVO" : "RECONECTANDO"}
            </span>
          </div>
          <div className="panel-body">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Buscar casa ou rua"
                placeholder="Encontre uma casa ou rua"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  onClick={() => setSearch("")}
                  aria-label="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="filter-tabs" aria-label="Filtrar casas">
              {[
                ["ALL", "Todas"],
                ["ACTIVE", "Com doces"],
                ["EMPTY", "Acabaram"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  className={filter === v ? "active" : ""}
                  onClick={() => setFilter(v)}
                  aria-pressed={filter === v}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="list-caption">
              <span>PELO BAIRRO</span>
              <span>{visible.length} CASAS</span>
            </div>
            <div className="house-list">
              {visible.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setSelected(h.id)}
                  className={`house-list-item ${selected === h.id ? "chosen" : ""}`}
                >
                  <span
                    className={`house-thumb ${h.status === "EMPTY" ? "sold-out" : ""}`}
                  >
                    <img
                      src={`/art/${h.status === "ACTIVE" ? "haunted-house" : "tombstone"}.svg`}
                      alt=""
                    />
                  </span>
                  <span className="house-list-copy">
                    <b>{h.name}</b>
                    <small>
                      {h.street}, {h.number}
                    </small>
                    <span
                      className={`status-inline ${h.status === "EMPTY" ? "is-empty" : ""}`}
                    >
                      <span />
                      {h.status === "ACTIVE"
                        ? "Pode vir, tem doces!"
                        : "Os doces acabaram"}
                    </span>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
              {!visible.length && (
                <div className="empty-state">
                  <Ghost size={28} />
                  <b>
                    {houses.length
                      ? "Nenhuma casa neste filtro"
                      : "Os fantasmas ainda estão se preparando"}
                  </b>
                  <p>
                    {houses.length
                      ? "Experimente outra busca ou filtro."
                      : "As casas aparecem quando os moradores ativam a distribuição."}
                  </p>
                </div>
              )}
            </div>
            <div className="panel-footer">
              <Candy size={17} />
              <span>Uma noite mais doce, juntos.</span>
            </div>
          </div>
        </aside>
        <div className="map-top-label">
          <span
            className={connected ? "connection-dot" : "connection-dot offline"}
          />
          {config?.demo
            ? "EXPLORANDO A DEMONSTRAÇÃO"
            : connected
              ? "O BAIRRO ESTÁ AO VIVO"
              : "TENTANDO RECONECTAR"}
        </div>
        <div className="avatar-control">
          <button
            className="avatar-toggle"
            onClick={() => setPicker(!picker)}
            aria-expanded={picker}
            aria-label="Escolher personagem"
          >
            <img src={`/art/avatar-${avatar}.svg`} alt="" />
            <span>Seu personagem</span>
            <ChevronDown size={15} />
          </button>
          {picker && (
            <div className="avatar-picker">
              <span className="eyebrow">QUEM VAI À CAÇA?</span>
              <p>Escolha sua fantasia.</p>
              <div className="avatar-grid">
                {(Object.keys(avatarNames) as Avatar[]).map((a) => (
                  <button
                    key={a}
                    className={a === avatar ? "selected" : ""}
                    onClick={() => {
                      setAvatar(a);
                      try {
                        localStorage.setItem("tot-avatar", a);
                      } catch {}
                      setPicker(false);
                    }}
                    aria-label={avatarNames[a]}
                    aria-pressed={a === avatar}
                  >
                    <img src={`/art/avatar-${a}.svg`} alt="" />
                    <span>{avatarNames[a]}</span>
                    {a === avatar && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="map-bottom-tools">
          <div className="map-legend">
            <span>
              <img src="/art/haunted-house.svg" alt="" /> Tem doces
            </span>
            <span>
              <img src="/art/tombstone.svg" alt="" /> Acabaram
            </span>
          </div>
          <button
            className="locate-button"
            aria-label="Minha localização"
            onClick={locate}
            disabled={locating}
          >
            <LocateFixed size={19} />
            <span>{locating ? "Localizando…" : "Minha localização"}</span>
          </button>
        </div>
        {chosen && (
          <section className="house-detail" aria-label="Detalhes da casa">
            <button
              className="detail-close icon-button"
              onClick={() => setSelected(undefined)}
              aria-label="Fechar detalhes"
            >
              <X size={18} />
            </button>
            <div
              className={`detail-art ${chosen.status === "EMPTY" ? "sold-out" : ""}`}
            >
              <img
                src={`/art/${chosen.status === "ACTIVE" ? "haunted-house" : "tombstone"}.svg`}
                alt=""
              />
              <span className="eyebrow">
                {chosen.status === "ACTIVE"
                  ? "DOCES À VISTA!"
                  : "ATÉ A PRÓXIMA DOÇURA"}
              </span>
            </div>
            <div className="detail-copy">
              <span
                className={`badge ${chosen.status === "ACTIVE" ? "green" : "gray"}`}
              >
                {chosen.status === "ACTIVE" ? (
                  <Candy size={13} />
                ) : (
                  <Skull size={13} />
                )}{" "}
                {chosen.status === "ACTIVE" ? "Tem doces" : "Doces acabaram"}
              </span>
              <h2>{chosen.name}</h2>
              <p className="address">
                <MapPin size={16} />
                {fullAddress(chosen)}
              </p>
              {chosen.note && <p className="house-note">“{chosen.note}”</p>}
              <small>Atualizado às {time(chosen.updatedAt)} </small>
            </div>
          </section>
        )}
        {(locationError || error) && (
          <div className="map-alert" role="status">
            <Crosshair size={18} />
            <span>{locationError || error}</span>
            <button
              className="icon-button"
              aria-label="Fechar aviso"
              onClick={() => {
                setError("");
                setLocationError("");
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>
          FEITO PARA UMA VIZINHANÇA MAIS DIVERTIDA <Ghost size={13} />
        </span>
        <nav>
          <a href="/privacidade">Privacidade</a>
          <a href="/termos">Termos de uso</a>
        </nav>
      </footer>
    </div>
  );
}
