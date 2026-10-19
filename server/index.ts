import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { createServer } from "node:http";
import express from "express";
import next from "next";
import { Server } from "socket.io";
import { openDatabase, migrate } from "./db";
import { Service } from "./service";
import { cookieValue } from "./security";
import { createApi } from "./app";
async function main() {
  const dev = process.env.NODE_ENV !== "production",
    demo = process.env.APP_DEMO_MODE === "true";
  const port = Number(process.env.PORT ?? 3000),
    host = process.env.HOST ?? "127.0.0.1";
  const origin = new URL(process.env.APP_URL ?? `http://localhost:${port}`)
    .origin;
  if (!dev && !origin.startsWith("https://"))
    throw new Error("Produção requer APP_URL com HTTPS.");
  if (demo && !dev)
    throw new Error(
      "Demonstração não permitida em produção. Configure APP_DEMO_MODE=false.",
    );
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (password.length < 12)
    throw new Error(
      "Configure ADMIN_PASSWORD com pelo menos 12 caracteres (ou execute npm run setup).",
    );
  if (
    !dev &&
    (!process.env.DATABASE_URL ||
      !process.env.GOOGLE_MAPS_GEOCODING_KEY ||
      !process.env.GOOGLE_MAPS_BROWSER_KEY ||
      !process.env.GOOGLE_MAPS_MAP_ID)
  )
    throw new Error(
      "Produção requer PostgreSQL externo e configuração completa do Google Maps.",
    );
  const db = await openDatabase(
    process.env.DATABASE_URL || undefined,
    process.env.PGLITE_PATH || (demo ? ".data/pglite-demo" : ".data/pglite"),
  );
  await migrate(db);
  await db.query(
    "CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text NOT NULL)",
  );
  await db.query(
    "INSERT INTO app_settings(key,value) VALUES('data_mode',$1) ON CONFLICT DO NOTHING",
    [demo ? "demo" : "real"],
  );
  const dataMode = (
    await db.query<{ value: string }>(
      "SELECT value FROM app_settings WHERE key='data_mode'",
    )
  ).rows[0];
  if (dataMode.value !== (demo ? "demo" : "real"))
    throw new Error(
      "Use bancos separados para demonstração e endereços reais. Configure DATABASE_URL ou PGLITE_PATH.",
    );
  const service = new Service(db, {
    demo,
    adminEmail: process.env.ADMIN_EMAIL ?? "admin@trickortrack.local",
    adminPassword: password,
    geocodingKey: process.env.GOOGLE_MAPS_GEOCODING_KEY,
  });
  await service.bootstrap();
  await service.refreshLocations();
  const nextApp = next({ dev, hostname: host, port });
  await nextApp.prepare();
  const app = express(),
    httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin, credentials: true },
    maxHttpBufferSize: 16384,
    allowRequest: (req, callback) =>
      callback(
        null,
        req.headers.origin === origin ||
          (!req.headers.origin && req.headers.host === new URL(origin).host),
      ),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void (async () => {
        io.to("public").emit("public:state", {
          houses: await service.houses(true),
        });
        // Revalidate every administrator session before sending protected data.
        for (const socket of io.sockets.sockets.values()) {
          if (socket.data.kind !== "admin") continue;
          const identity = await service.identity(
            cookieValue(socket.request, "tot_admin"),
          );
          if (identity?.kind !== "admin") {
            socket.disconnect();
            continue;
          }
          socket.emit("admin:changed");
        }
      })().catch(() => console.error("Realtime update failed"));
    }, 200);
  };
  io.on("connection", (socket) => {
    void (async () => {
      socket.join("public");
      socket.emit("public:state", { houses: await service.houses(true) });
      const identity = await service.identity(
        cookieValue(socket.request, "tot_admin"),
      );
      if (identity?.kind === "admin") {
        socket.data.kind = "admin";
        socket.emit("admin:changed");
      }
    })().catch(() => socket.disconnect());
  });
  app.disable("x-powered-by");
  app.use((_req, res, nextMiddleware) => {
    res.set({
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    nextMiddleware();
  });
  app.use(
    "/api",
    createApi(service, {
      origin,
      secure: origin.startsWith("https:"),
      changed,
      config: {
        demo,
        mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY ?? "",
        mapId: process.env.GOOGLE_MAPS_MAP_ID ?? "",
        center: { lat: -25.4284, lng: -49.2733 },
        ...(demo
          ? {
              adminEmail: process.env.ADMIN_EMAIL ?? "admin@trickortrack.local",
            }
          : {}),
      },
    }),
  );
  app.use((req, res) => nextApp.getRequestHandler()(req, res));
  const maintenance = setInterval(() => {
    void (async () => {
      await service.refreshLocations();
      await db.query("DELETE FROM sessions WHERE expires_at<now()");
      changed();
    })().catch(() => console.error("Maintenance failed"));
  }, 6 * 3600000);
  maintenance.unref();
  httpServer.listen(port, host, () =>
    console.log(
      `\nTrickOrTrack: ${origin}\nOrganização: ${origin}/admin\n${demo ? "DEMONSTRAÇÃO: endereços fictícios e mapa ilustrativo.\n" : "Google Maps: configure as restrições das duas chaves no Google Cloud.\n"}`,
    ),
  );
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    clearInterval(maintenance);
    if (timer) clearTimeout(timer);
    io.close();
    httpServer.close();
    void nextApp
      .close()
      .then(() => db.close())
      .finally(() => process.exit(0));
  };
  // O preparador usa IPC para encerrar o banco com segurança também no Windows.
  process.on("message", (message) => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "local:shutdown"
    )
      shutdown();
  });
  if (process.send) process.once("disconnect", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
