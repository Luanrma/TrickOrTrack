"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowRight,
  Candy,
  Check,
  Ghost,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Skull,
} from "lucide-react";
import { Header } from "./brand";
import { api, post, time } from "@/lib/client";
import { fullAddress, type House } from "@/lib/types";
export default function Resident() {
  const [house, setHouse] = useState<House | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false);
  const initialized = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const s = await api<{ house: House }>("/resident/house");
      setHouse(s.house);
    } catch (e) {
      setHouse(null);
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (token) window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      try {
        if (token) await api("/resident/access", post({ token }));
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);
  useEffect(() => {
    if (!house) return;
    const socket = io({ transports: ["websocket", "polling"] });
    socket.on("public:state", refresh);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, [!!house, refresh]);
  async function toggle() {
    if (!house) return;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const s = await api<{ house: House }>(
        "/resident/status",
        post({ status: house.status === "ACTIVE" ? "EMPTY" : "ACTIVE" }),
      );
      setHouse(s.house);
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-shell resident-shell">
      <Header />
      <main className="resident-main">
        <span className="eyebrow">
          <ShieldCheck size={14} /> CONTROLE EXCLUSIVO DA SUA CASA
        </span>
        {loading ? (
          <div className="resident-card">
            <LoaderCircle className="spin" />
            <h2>Conferindo sua chave…</h2>
          </div>
        ) : !house ? (
          <div className="resident-card invalid-link">
            <Ghost size={44} />
            <h1>Esta chave não abriu a porta.</h1>
            <p role="alert">
              {error ||
                "Peça o link exclusivo da sua casa à organização do evento."}
            </p>
            <a href="/" className="button secondary">
              Explorar o mapa
              <ArrowRight size={16} />
            </a>
          </div>
        ) : (
          <>
            <div
              className={`resident-card resident-${house.status.toLowerCase()}`}
            >
              <div className="resident-art">
                <img
                  src={`/art/${house.status === "EMPTY" ? "tombstone" : "haunted-house"}.svg`}
                  alt=""
                />
                {house.status === "ACTIVE" && (
                  <span className="resident-live">
                    <span className="pulse" /> SUA CASA ESTÁ NO MAPA
                  </span>
                )}
              </div>
              <span
                className={`badge ${house.status === "ACTIVE" ? "green" : house.status === "EMPTY" ? "gray" : "purple"}`}
              >
                {house.status === "ACTIVE" ? (
                  <Candy size={14} />
                ) : house.status === "EMPTY" ? (
                  <Skull size={14} />
                ) : (
                  <Ghost size={14} />
                )}{" "}
                {house.status === "ACTIVE"
                  ? "Estamos distribuindo!"
                  : house.status === "EMPTY"
                    ? "Doces acabaram"
                    : "Tudo pronto para começar?"}
              </span>
              <h1>{house.name}</h1>
              <p className="resident-address">
                <MapPin size={15} />
                {fullAddress(house)}
              </p>
              <p className="resident-description">
                {house.status === "PENDING"
                  ? "Sua casa está cadastrada, mas ainda não aparece no mapa. Ative quando estiver pronto para receber as crianças."
                  : house.status === "ACTIVE"
                    ? "As famílias já podem encontrar sua casa. Quando os doces acabarem, avise com um toque."
                    : "Uma lápide aparece no lugar da sua casa. Se repuser os doces, você pode voltar à brincadeira."}
              </p>
              <button
                className={`button full resident-action ${house.status === "ACTIVE" ? "secondary" : "primary"}`}
                onClick={() => void toggle()}
                disabled={busy || !house.locationValid}
              >
                {busy ? (
                  <LoaderCircle size={20} className="spin" />
                ) : house.status === "ACTIVE" ? (
                  <>
                    <Skull size={20} /> Acabaram os doces
                  </>
                ) : (
                  <>
                    <Candy size={20} />
                    {house.status === "PENDING"
                      ? "Começar a distribuir"
                      : "Voltamos! Temos doces"}
                  </>
                )}
              </button>
              {!house.locationValid && (
                <p className="form-error">
                  A organização precisa revalidar o endereço antes de ativar.
                </p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {success && (
                <p className="save-success" role="status">
                  <Check size={16} /> Mapa atualizado. Obrigado por avisar!
                </p>
              )}
              <small className="resident-updated">
                Última atualização às {time(house.updatedAt)}
              </small>
            </div>
            <p className="resident-footnote">
              <ShieldCheck size={15} /> Guarde este acesso com você. Ele
              controla apenas sua casa.
            </p>
            <a href="/" className="text-link">
              Ver o mapa do bairro
              <ArrowRight size={15} />
            </a>
          </>
        )}
      </main>
    </div>
  );
}
