import express from "express";
import rateLimit from "express-rate-limit";
import { z, ZodError } from "zod";
import { Service, type Identity } from "./service";
import { AppError } from "./geocoding";
import { checkOrigin, cookieValue } from "./security";
import type { AppConfig } from "../lib/types";
export function createApi(
  service: Service,
  options: {
    origin: string;
    config: AppConfig;
    changed: () => void;
    rateLimits?: boolean;
    secure?: boolean;
  },
) {
  const api = express.Router();
  api.use(express.json({ limit: "16kb" }));
  api.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  api.use((req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !checkOrigin(req, options.origin)
    )
      return next(new AppError(403, "Origem da solicitação não autorizada."));
    next();
  });
  const limited =
    options.rateLimits !== false
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 12,
          standardHeaders: "draft-8",
          legacyHeaders: false,
          message: { error: "Muitas tentativas. Aguarde alguns minutos." },
        })
      : (
          _req: express.Request,
          _res: express.Response,
          next: express.NextFunction,
        ) => next();
  const writes =
    options.rateLimits !== false
      ? rateLimit({
          windowMs: 60000,
          limit: 60,
          standardHeaders: "draft-8",
          legacyHeaders: false,
          skip: (req) => req.method === "GET",
          message: { error: "Aguarde um momento antes de alterar novamente." },
        })
      : (
          _req: express.Request,
          _res: express.Response,
          next: express.NextFunction,
        ) => next();
  api.use(writes);
  const identity = async (req: express.Request, kind: Identity["kind"]) => {
    const id = await service.identity(
      cookieValue(req, kind === "admin" ? "tot_admin" : "tot_resident"),
    );
    if (id?.kind !== kind)
      throw new AppError(
        401,
        kind === "admin"
          ? "Entre com sua conta de administrador."
          : "Link inválido, revogado ou expirado. Peça um novo link à organização.",
      );
    return id;
  };
  const setCookie = (
    res: express.Response,
    name: string,
    value: string,
    age: number,
  ) =>
    res.cookie(name, value, {
      httpOnly: true,
      secure: options.secure,
      sameSite: "strict",
      path: "/",
      maxAge: age,
    });
  api.get("/health", async (_req, res) => {
    await service.db.query("SELECT 1");
    res.json({ ok: true });
  });
  api.get("/config", (_req, res) => res.json(options.config));
  api.get("/houses", async (_req, res) =>
    res.json({ houses: await service.houses(true) }),
  );
  api.post("/admin/login", limited, async (req, res) => {
    const v = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(256),
      })
      .parse(req.body);
    const token = await service.login(v.email, v.password);
    setCookie(res, "tot_admin", token, 12 * 3600000);
    res.json({ ok: true });
  });
  api.post("/admin/logout", async (req, res) => {
    await service.logout(cookieValue(req, "tot_admin"));
    res.clearCookie("tot_admin", { path: "/" }).json({ ok: true });
  });
  api.get("/admin/me", async (req, res) => {
    const id = await identity(req, "admin");
    res.json({ email: id.label });
  });
  api.get("/admin/state", async (req, res) => {
    await identity(req, "admin");
    res.json({
      houses: await service.houses(),
      events: await service.events(),
    });
  });
  api.get("/admin/events", async (req, res) => {
    await identity(req, "admin");
    const before = z.string().regex(/^\d+$/).optional().parse(req.query.before);
    res.json({ events: await service.events(before) });
  });
  api.post("/admin/houses", async (req, res) => {
    const id = await identity(req, "admin"),
      house = await service.createHouse(req.body, id.label);
    options.changed();
    res.status(201).json({ house });
  });
  api.patch("/admin/houses/:id", async (req, res) => {
    const id = await identity(req, "admin"),
      house = await service.editHouse(
        z.uuid().parse(req.params.id),
        req.body,
        id.label,
      );
    options.changed();
    res.json({ house });
  });
  api.post("/admin/houses/:id/status", async (req, res) => {
    const id = await identity(req, "admin"),
      status = z.enum(["ACTIVE", "EMPTY"]).parse(req.body.status);
    const house = await service.setStatus(
      z.uuid().parse(req.params.id),
      status,
      id,
    );
    options.changed();
    res.json({ house });
  });
  api.post("/admin/houses/:id/link", async (req, res) => {
    const id = await identity(req, "admin"),
      token = await service.issueLink(z.uuid().parse(req.params.id), id.label);
    options.changed();
    res.json({
      url: `${options.origin}/casa#token=${token}`,
      expiresInDays: 30,
    });
  });
  api.delete("/admin/houses/:id/link", async (req, res) => {
    const id = await identity(req, "admin");
    await service.revokeLink(z.uuid().parse(req.params.id), id.label);
    options.changed();
    res.json({ ok: true });
  });
  api.post("/resident/access", limited, async (req, res) => {
    const token = z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .parse(req.body.token);
    setCookie(
      res,
      "tot_resident",
      await service.exchange(token),
      30 * 86400000,
    );
    res.json({ ok: true });
  });
  api.get("/resident/house", async (req, res) => {
    const id = await identity(req, "resident");
    res.json({ house: await service.house(id.houseId!) });
  });
  api.post("/resident/status", async (req, res) => {
    const id = await identity(req, "resident"),
      status = z.enum(["ACTIVE", "EMPTY"]).parse(req.body.status);
    const house = await service.setStatus(id.houseId!, status, id);
    options.changed();
    res.json({ house });
  });
  api.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError)
        return res
          .status(400)
          .json({
            error: "Confira os campos informados.",
            fields: err.issues.map((i) => i.path.join(".")),
          });
      if (err instanceof AppError)
        return res.status(err.status).json({ error: err.message });
      if ((err as { type?: string }).type === "entity.parse.failed")
        return res.status(400).json({ error: "Solicitação inválida." });
      console.error(
        "API error:",
        err instanceof Error ? err.name : "UnknownError",
      );
      res
        .status(500)
        .json({ error: "Não foi possível concluir. Tente novamente." });
    },
  );
  return api;
}
