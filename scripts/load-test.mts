/** Transport smoke test; not a capacity certificate for a future host. Uses an isolated demo DB. */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
const count = Number(process.argv[2] || 1000);
if (!Number.isInteger(count) || count < 1 || count > 2000)
  throw new Error("Informe de 1 a 2000 clientes.");
const origin = "http://localhost:3101",
  password = randomUUID(),
  sockets: Socket[] = [];
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "development",
    APP_URL: origin,
    PORT: "3101",
    HOST: "127.0.0.1",
    APP_DEMO_MODE: "true",
    DATABASE_URL: "",
    PGLITE_PATH: `.data/load-${randomUUID()}`,
    NEXT_DIST_DIR: ".next-load",
    ADMIN_EMAIL: "load@trickortrack.local",
    ADMIN_PASSWORD: password,
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (v) => {
  logs = (logs + v.toString()).slice(-6000);
});
server.stderr.on("data", (v) => {
  logs = (logs + v.toString()).slice(-6000);
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ];
try {
  let ready = false;
  for (let i = 0; i < 450; i++) {
    if (server.exitCode !== null) throw new Error(`Servidor encerrou: ${logs}`);
    try {
      if ((await fetch(`${origin}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  if (!ready) throw new Error(`Servidor não iniciou: ${logs}`);
  const config = await (await fetch(`${origin}/api/config`)).json();
  if (!config.demo) throw new Error("Teste permitido somente em demonstração.");
  const login = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "load@trickortrack.local", password }),
  });
  if (!login.ok) throw new Error("Falha no login de teste.");
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const state = await (await fetch(`${origin}/api/houses`)).json(),
    house = state.houses[0];
  let connected = 0,
    received = 0;
  const connectTimes: number[] = [],
    deliveryTimes: number[] = [];
  const start = performance.now();
  for (let offset = 0; offset < count; offset += 50) {
    await Promise.all(
      Array.from(
        { length: Math.min(50, count - offset) },
        () =>
          new Promise<void>((resolve, reject) => {
            const t = performance.now();
            const socket = io(origin, {
              transports: ["websocket"],
              forceNew: true,
              reconnection: false,
              extraHeaders: { Origin: origin },
              timeout: 20000,
            });
            sockets.push(socket);
            const timer = setTimeout(
              () => reject(new Error("Timeout de conexão")),
              25000,
            );
            socket.once("connect_error", (e) => {
              clearTimeout(timer);
              reject(e);
            });
            socket.once("public:state", () => {
              clearTimeout(timer);
              connected++;
              connectTimes.push(performance.now() - t);
              resolve();
            });
          }),
      ),
    );
  }
  let updateStarted = 0;
  const delivered = Promise.all(
    sockets.map(
      (socket) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Timeout de atualização")),
            20000,
          );
          socket.once("public:state", (state) => {
            if (
              state.houses.find((h: { id: string }) => h.id === house.id)
                ?.status !== "EMPTY"
            ) {
              clearTimeout(timer);
              reject(new Error("Estado divergente"));
              return;
            }
            clearTimeout(timer);
            received++;
            deliveryTimes.push(performance.now() - updateStarted);
            resolve();
          });
        }),
    ),
  );
  updateStarted = performance.now();
  const response = await fetch(
    `${origin}/api/admin/houses/${house.id}/status`,
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ status: "EMPTY" }),
    },
  );
  if (!response.ok) throw new Error(`Mudança rejeitada: ${response.status}`);
  await delivered;
  console.log(
    JSON.stringify(
      {
        clients: count,
        connected,
        received,
        connectP95Ms: Math.round(percentile(connectTimes, 0.95)),
        updateP95Ms: Math.round(percentile(deliveryTimes, 0.95)),
        updateMaxMs: Math.round(Math.max(...deliveryTimes)),
        totalMs: Math.round(performance.now() - start),
        scope:
          "Loopback local, Socket.IO + API + PGlite; sem Google Maps, tráfego público ou hospedagem final.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  for (const s of sockets) s.disconnect();
  server.kill("SIGTERM");
  await Promise.race([new Promise((r) => server.once("exit", r)), delay(3000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
