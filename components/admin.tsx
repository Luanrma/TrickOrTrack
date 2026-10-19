"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  ArrowRight,
  Candy,
  Check,
  Clipboard,
  ExternalLink,
  Ghost,
  History,
  House as HouseIcon,
  Link as LinkIcon,
  LoaderCircle,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Skull,
  Trash2,
  X,
} from "lucide-react";
import { Header } from "./brand";
import { EventMap } from "./map";
import { api, post, time } from "@/lib/client";
import {
  fullAddress,
  statusLabels,
  type AppConfig,
  type AuditEvent,
  type House,
  type HouseStatus,
} from "@/lib/types";

const eventLabels: Record<string, string> = {
  "house.created": "Casa cadastrada",
  "house.updated": "Cadastro atualizado",
  "access.issued": "Novo link gerado",
  "access.revoked": "Link revogado",
  "distribution.started": "Distribuição ativada",
  "distribution.stopped": "Doces acabaram",
  "distribution.resumed": "Doces repostos",
};
type FormValues = Pick<
  House,
  | "name"
  | "note"
  | "cep"
  | "street"
  | "number"
  | "neighborhood"
  | "city"
  | "state"
>;
const emptyForm: FormValues = {
  name: "",
  note: "",
  cep: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "PR",
};
function Modal({
  children,
  title,
  close,
}: {
  children: React.ReactNode;
  title: string;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          aria-label="Fechar janela"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Admin() {
  const [user, setUser] = useState<string | null>(null),
    [checking, setChecking] = useState(true),
    [config, setConfig] = useState<AppConfig>();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [houses, setHouses] = useState<House[]>([]),
    [events, setEvents] = useState<AuditEvent[]>([]),
    [tab, setTab] = useState("houses"),
    [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState("");
  const [form, setForm] = useState<FormValues | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [generatedLink, setGeneratedLink] = useState<string | null>(null),
    [copied, setCopied] = useState(false),
    [revoking, setRevoking] = useState(false),
    [toast, setToast] = useState(""),
    [online, setOnline] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const s = await api<{ houses: House[]; events: AuditEvent[] }>(
        "/admin/state",
      );
      setHouses(s.houses);
      setEvents(s.events);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void api<AppConfig>("/config")
      .then((c) => {
        setConfig(c);
        if (c.adminEmail) setEmail(c.adminEmail);
      })
      .catch(() => setError("Não foi possível carregar a configuração."));
    void api<{ email: string }>("/admin/me")
      .then((s) => setUser(s.email))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    void refresh();
    const socket = io({ transports: ["websocket", "polling"] });
    socket.on("admin:changed", refresh);
    socket.on("connect", () => setOnline(true));
    socket.on("disconnect", () => setOnline(false));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, [user, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const selected = houses.find((h) => h.id === selectedId);
  const filtered = houses.filter(
    (h) =>
      (filter === "ALL" || h.status === filter) &&
      `${h.name} ${fullAddress(h)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const filteredIds = new Set(filtered.map((h) => h.id));
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      await api("/admin/login", post({ email, password }));
      setUser(email);
      setPassword("");
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      await api(editing ? `/admin/houses/${editing}` : "/admin/houses", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      setForm(null);
      setEditing(null);
      setToast(
        editing
          ? "Cadastro atualizado."
          : "Casa cadastrada. Ela permanece oculta até a primeira ativação.",
      );
      await refresh();
    });
  }
  async function issueLink(h: House) {
    await action(async () => {
      const s = await api<{ url: string }>(
        `/admin/houses/${h.id}/link`,
        post(),
      );
      setGeneratedLink(s.url);
      setCopied(false);
      await refresh();
    });
  }
  const openNew = () => {
    setError("");
    setEditing(null);
    setForm({ ...emptyForm });
  };
  if (checking)
    return (
      <div className="page-shell">
        <Header admin />
        <div className="center-loading">
          <LoaderCircle className="spin" /> Preparando a organização…
        </div>
      </div>
    );
  if (!user)
    return (
      <div className="page-shell">
        <Header admin />
        <main className="login-layout">
          <div className="login-story">
            <span className="eyebrow">NOS BASTIDORES DA TRAVESSURA</span>
            <h1>
              Uma noite incrível
              <br />
              começa com uma
              <br />
              <span>boa vizinhança.</span>
            </h1>
            <p>
              Organize as casas, acompanhe as doçuras e deixe os pequenos sustos
              por conta das fantasias.
            </p>
            <img
              src="/art/haunted-house.svg"
              alt="Casinha mal-assombrada com um doce"
              className="login-art"
            />
          </div>
          <form className="login-card" onSubmit={login}>
            <span className="login-lock">
              <ShieldCheck size={27} />
            </span>
            <span className="eyebrow">ACESSO DA ORGANIZAÇÃO</span>
            <h2>Bem-vindo aos bastidores.</h2>
            <p>Entre para cuidar da noite mais doce do bairro.</p>
            <label>
              E-mail
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <>
                  Entrar na organização
                  <ArrowRight size={17} />
                </>
              )}
            </button>
            {config?.demo && (
              <p className="demo-notice">
                <Ghost size={16} /> Ambiente de demonstração com casas
                fictícias.
              </p>
            )}
            <a className="text-link" href="/">
              Só quero encontrar doces <ArrowRight size={14} />
            </a>
          </form>
        </main>
      </div>
    );
  return (
    <div className="admin-app">
      <Header admin />
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="sidebar-label">CENTRAL DA ORGANIZAÇÃO</div>
          <button
            className={tab === "houses" ? "active" : ""}
            onClick={() => setTab("houses")}
          >
            <HouseIcon size={19} /> Casas participantes
            <span>{houses.length}</span>
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            <History size={19} /> Histórico de atividades
          </button>
          <button
            className={tab === "map" ? "active" : ""}
            onClick={() => setTab("map")}
          >
            <MapPin size={19} /> Mapa das casas
          </button>
          <div className="sidebar-bottom">
            <span className="admin-user">
              <ShieldCheck size={18} />
              <span>
                Organização<small>{user}</small>
              </span>
            </span>
            <button
              onClick={() =>
                void action(async () => {
                  await api("/admin/logout", post());
                  setUser(null);
                })
              }
            >
              <LogOut size={17} /> Sair
            </button>
          </div>
        </aside>
        <main className="admin-main">
          <div className="admin-title">
            <div>
              <span className="eyebrow">
                {tab !== "history"
                  ? "TUDO PRONTO PARA A TRAVESSURA?"
                  : "CADA DOÇURA, REGISTRADA"}
              </span>
              <h1>
                {tab !== "history"
                  ? "O bairro em suas mãos."
                  : "A noite, em tempo real."}
              </h1>
              <p>
                {tab !== "history"
                  ? "Cadastre as casas e acompanhe quem está distribuindo doces."
                  : "Ativações, reposições, cadastros e alterações de acesso."}
              </p>
            </div>
            <button className="button primary" onClick={openNew}>
              <Plus size={18} /> Cadastrar casa
            </button>
          </div>
          {config?.demo && (
            <div className="demo-banner">
              <Ghost size={17} />
              <span>
                <b>Modo demonstração</b> · As casas e os endereços são
                fictícios.
              </span>
              <a href="/">
                Explorar mapa
                <ExternalLink size={13} />
              </a>
            </div>
          )}
          <div className="stat-grid">
            {(
              [
                {
                  status: "ACTIVE",
                  icon: Candy,
                  label: "Casas com doces",
                  color: "green",
                },
                {
                  status: "EMPTY",
                  icon: Skull,
                  label: "Doces acabaram",
                  color: "gray",
                },
                {
                  status: "PENDING",
                  icon: Ghost,
                  label: "Aguardando ativação",
                  color: "purple",
                },
              ] as const
            ).map((s) => (
              <button
                key={s.status}
                className={`stat-card ${filter === s.status ? "selected" : ""}`}
                onClick={() =>
                  setFilter(filter === s.status ? "ALL" : s.status)
                }
              >
                <span className={`stat-icon ${s.color}`}>
                  <s.icon size={22} />
                </span>
                <span>
                  <strong>
                    {houses
                      .filter((h) => h.status === s.status)
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                  <small>{s.label}</small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Fechar erro"
              >
                <X size={15} />
              </button>
            </div>
          )}
          <section className="admin-table-card">
            <div className="table-tools">
              <div className="filter-tabs">
                {[
                  ["ALL", "Todas"],
                  ["ACTIVE", "Com doces"],
                  ["EMPTY", "Sem doces"],
                  ["PENDING", "Não ativadas"],
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
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="Buscar casas na organização"
                  placeholder="Buscar casa ou endereço"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {tab === "map" && config ? (
              <div className="admin-map" aria-label="Mapa administrativo">
                <EventMap
                  houses={filtered.filter((h) => h.locationValid)}
                  config={config}
                  selected={selectedId ?? undefined}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setRevoking(false);
                  }}
                  avatar="pumpkin"
                  position={null}
                  focus={0}
                />
              </div>
            ) : tab === "houses" ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>CASA PARTICIPANTE</th>
                        <th>DISPONIBILIDADE</th>
                        <th>ÚLTIMA ATUALIZAÇÃO</th>
                        <th>
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((h) => (
                        <tr key={h.id}>
                          <td>
                            <button
                              className="table-house"
                              onClick={() => {
                                setSelectedId(h.id);
                                setRevoking(false);
                              }}
                            >
                              <img
                                src={`/art/${h.status === "EMPTY" ? "tombstone" : h.status === "PENDING" ? "pending-house" : "haunted-house"}.svg`}
                                alt=""
                              />
                              <span>
                                <b>{h.name}</b>
                                <small>{fullAddress(h)}</small>
                                {!h.locationValid && (
                                  <small className="warning-text">
                                    Endereço precisa ser revalidado
                                  </small>
                                )}
                              </span>
                            </button>
                          </td>
                          <td>
                            <span
                              className={`badge ${h.status === "ACTIVE" ? "green" : h.status === "PENDING" ? "purple" : "gray"}`}
                            >
                              <span className="badge-dot" />
                              {statusLabels[h.status]}
                            </span>
                          </td>
                          <td>
                            <span className="table-time">
                              {time(h.updatedAt)}
                            </span>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`Gerenciar ${h.name}`}
                              onClick={() => {
                                setSelectedId(h.id);
                                setRevoking(false);
                              }}
                            >
                              <ArrowRight size={19} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <div className="empty-state">
                    <HouseIcon size={32} />
                    <b>Nenhuma casa por aqui ainda.</b>
                    <p>Cadastre uma casa ou altere os filtros.</p>
                    <button className="button secondary" onClick={openNew}>
                      <Plus size={16} /> Cadastrar casa
                    </button>
                  </div>
                )}
                <div className="table-footer">
                  {filtered.length} de {houses.length} casas
                  <span>
                    <i
                      className={
                        online ? "connection-dot" : "connection-dot offline"
                      }
                    />
                    {online ? "Atualizações ao vivo" : "Atualização periódica"}
                  </span>
                </div>
              </>
            ) : (
              <div className="activity-list">
                {events
                  .filter((e) => filteredIds.has(e.houseId))
                  .map((e) => (
                    <div className="activity" key={e.id}>
                      <span
                        className={`activity-icon ${e.action === "distribution.stopped" ? "gray" : "purple"}`}
                      >
                        {e.action.startsWith("access") ? (
                          <LinkIcon size={17} />
                        ) : e.action.startsWith("house") ? (
                          <HouseIcon size={17} />
                        ) : (
                          <Candy size={17} />
                        )}
                      </span>
                      <div>
                        <b>{eventLabels[e.action] ?? e.action}</b>
                        <p>{e.houseName}</p>
                        <small>
                          Por{" "}
                          {e.actor === "Link da casa"
                            ? "responsável, via link da casa"
                            : e.actor}
                        </small>
                        {typeof e.details.from === "string" &&
                          typeof e.details.to === "string" && (
                            <div className="history-details">
                              {statusLabels[e.details.from as HouseStatus]} →{" "}
                              {statusLabels[e.details.to as HouseStatus]}
                            </div>
                          )}
                      </div>
                      <time dateTime={e.createdAt}>
                        {new Date(e.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}{" "}
                        · {time(e.createdAt)}
                      </time>
                    </div>
                  ))}
                {!events.filter((e) => filteredIds.has(e.houseId)).length && (
                  <div className="empty-state">
                    <History size={28} />
                    <b>Nenhuma atividade neste filtro.</b>
                  </div>
                )}
                {events.length >= 100 && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      void action(async () => {
                        const next = await api<{ events: AuditEvent[] }>(
                          `/admin/events?before=${events.at(-1)!.id}`,
                        );
                        setEvents((v) => [...v, ...next.events]);
                      })
                    }
                  >
                    Carregar atividades anteriores
                  </button>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
      {selected && !form && !generatedLink && (
        <Modal
          title="Gerenciar casa"
          close={() => {
            setSelectedId(null);
            setError("");
          }}
        >
          <div className="manage-house">
            <div className="manage-title">
              <img
                src={`/art/${selected.status === "EMPTY" ? "tombstone" : selected.status === "PENDING" ? "pending-house" : "haunted-house"}.svg`}
                alt=""
              />
              <div>
                <h3>{selected.name}</h3>
                <p>{fullAddress(selected)}</p>
              </div>
            </div>
            <span
              className={`badge ${selected.status === "ACTIVE" ? "green" : selected.status === "PENDING" ? "purple" : "gray"}`}
            >
              {statusLabels[selected.status]}
            </span>
            {selected.note && <p className="house-note">{selected.note}</p>}
            <p className="muted">
              {selected.status === "PENDING"
                ? "Esta casa ainda não aparece no mapa público. O responsável poderá ativá-la pelo link exclusivo."
                : `Última alteração às ${time(selected.updatedAt)}.`}
            </p>
            <div className="manage-buttons">
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void issueLink(selected)}
              >
                <LinkIcon size={17} /> Gerar novo link exclusivo
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setEditing(selected.id);
                  setForm({
                    name: selected.name,
                    note: selected.note,
                    cep: selected.cep,
                    street: selected.street,
                    number: selected.number,
                    neighborhood: selected.neighborhood,
                    city: selected.city,
                    state: selected.state,
                  });
                  setError("");
                }}
              >
                <Pencil size={16} /> Editar cadastro
              </button>
              <button
                className="button secondary"
                disabled={busy || !selected.locationValid}
                onClick={() =>
                  void action(async () => {
                    await api(
                      `/admin/houses/${selected.id}/status`,
                      post({
                        status:
                          selected.status === "ACTIVE" ? "EMPTY" : "ACTIVE",
                      }),
                    );
                    await refresh();
                    setToast("Disponibilidade atualizada.");
                  })
                }
              >
                <Candy size={17} />
                {selected.status === "ACTIVE"
                  ? "Marcar que os doces acabaram"
                  : "Ativar distribuição"}
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => {
                  if (!revoking) {
                    setRevoking(true);
                    return;
                  }
                  void action(async () => {
                    await api(`/admin/houses/${selected.id}/link`, {
                      method: "DELETE",
                    });
                    setRevoking(false);
                    setToast("Link e sessões anteriores revogados.");
                    await refresh();
                  });
                }}
              >
                <Trash2 size={16} />
                {revoking
                  ? "Confirmar revogação do link"
                  : "Revogar link de controle"}
              </button>
            </div>
            <p className="muted small">
              Gerar um novo link invalida o anterior e encerra seus acessos. O
              cadastro da casa e seu status são preservados.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
      {form && (
        <Modal
          title={editing ? "Editar casa" : "Uma nova casa na travessura"}
          close={() => {
            setForm(null);
            setEditing(null);
            setError("");
          }}
        >
          <form className="house-form" onSubmit={save}>
            <p className="muted">
              Informe o endereço completo. A localização será encontrada
              automaticamente.
            </p>
            {config?.demo && !editing && (
              <button
                type="button"
                className="demo-fill"
                onClick={() => {
                  const used = new Set(houses.map((h) => h.number));
                  const n =
                    ["919", "1001", "1111", "1212"].find((n) => !used.has(n)) ??
                    "919";
                  setForm({
                    name: "A nova casa encantada",
                    note: "Toque a campainha para ganhar doces!",
                    cep: "80000000",
                    street: "Rua das Abóboras",
                    number: n,
                    neighborhood: "Lua Nova (fictício)",
                    city: "Curitiba",
                    state: "PR",
                  });
                }}
              >
                <SparkleIcon />
                Preencher endereço de demonstração
              </button>
            )}
            <label>
              Nome da casa
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: A casa da família Silva"
              />
            </label>
            <div className="form-grid">
              <label>
                CEP
                <input
                  required
                  inputMode="numeric"
                  maxLength={9}
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  placeholder="00000-000"
                />
              </label>
              <label>
                Número
                <input
                  required
                  maxLength={12}
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </label>
            </div>
            <label>
              Rua
              <input
                required
                maxLength={150}
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
              />
            </label>
            <label>
              Bairro
              <input
                required
                maxLength={100}
                value={form.neighborhood}
                onChange={(e) =>
                  setForm({ ...form, neighborhood: e.target.value })
                }
              />
            </label>
            <div className="form-grid city-grid">
              <label>
                Cidade
                <input
                  required
                  maxLength={100}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label>
                Estado
                <select
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                >
                  {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                    .split(" ")
                    .map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Orientação aos visitantes{" "}
              <span className="muted">(opcional)</span>
              <textarea
                maxLength={300}
                rows={3}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Ex.: Os doces serão entregues no portão."
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setForm(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spin" /> Conferindo
                    endereço…
                  </>
                ) : editing ? (
                  "Salvar alterações"
                ) : (
                  "Cadastrar casa"
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {generatedLink && (
        <Modal
          title="A chave desta casa"
          close={() => {
            setGeneratedLink(null);
            setError("");
          }}
        >
          <div className="link-result">
            <span className="link-illustration">
              <LinkIcon size={30} />
            </span>
            <h3>Pronto para enviar ao responsável.</h3>
            <p>
              Este link permite ativar ou encerrar a distribuição desta casa por
              30 dias. Quem possuir o link terá esse acesso.
            </p>
            <label>
              Link exclusivo
              <input
                readOnly
                value={generatedLink}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <div className="link-actions">
              <button
                className="button primary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(generatedLink)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError("Selecione o link e copie manualmente."),
                    )
                }
              >
                {copied ? <Check size={16} /> : <Clipboard size={16} />}{" "}
                {copied ? "Copiado!" : "Copiar link"}
              </button>
              <a
                href={generatedLink}
                className="button secondary"
                target="_blank"
                rel="noreferrer"
              >
                Abrir controle
                <ExternalLink size={15} />
              </a>
            </div>
            <p className="muted small">
              O token é exibido apenas agora. Se perder o link, gere um novo.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function SparkleIcon() {
  return <Ghost size={16} />;
}
