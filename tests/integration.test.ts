import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { openDatabase, migrate, type Database } from "../server/db";
import { Service } from "../server/service";
import { createApi } from "../server/app";
import { digest, secret } from "../server/security";
import { googleGeocoder } from "../server/geocoding";

const origin = "http://localhost:3000",
  adminPassword = "test-password-123456789";
const input = {
  name: "Casa da bruxa",
  note: "No portão",
  cep: "80000000",
  street: "Rua das Abóboras",
  number: "919",
  neighborhood: "Lua Nova",
  city: "Curitiba",
  state: "PR",
};
let db: Database, service: Service, server: Server, base: string;
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
  requestOrigin: string | null = origin,
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
    headers: res.headers,
  };
}
beforeAll(async () => {
  db = await openDatabase(undefined, ":memory:");
  await migrate(db);
  service = new Service(db, {
    demo: true,
    adminEmail: "admin@example.com",
    adminPassword,
  });
  await service.bootstrap();
  const app = express();
  app.use(
    createApi(service, {
      origin,
      config: {
        demo: true,
        mapsKey: "",
        mapId: "",
        center: { lat: 0, lng: 0 },
      },
      changed: vi.fn(),
      rateLimits: false,
    }),
  );
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});
beforeEach(async () => {
  await db.query("DELETE FROM audit_events");
  await db.query("DELETE FROM sessions");
  await db.query("DELETE FROM access_tokens");
  await db.query("DELETE FROM houses");
});
async function admin() {
  return (
    await request("/admin/login", "POST", {
      email: "admin@example.com",
      password: adminPassword,
    })
  ).cookie!;
}
async function resident(id: string) {
  const token = await service.issueLink(id, "admin");
  return {
    token,
    cookie: (await request("/resident/access", "POST", { token })).cookie!,
  };
}

describe("Autorização e ciclo de distribuição", () => {
  it("mantém a casa oculta ao cadastrar, gerar link e abrir o controle", async () => {
    const h = await service.createHouse(input, "admin");
    await resident(h.id);
    expect((await request("/houses")).data.houses).toEqual([]);
    expect((await service.house(h.id)).status).toBe("PENDING");
  });
  it("ativa, exibe lápide ao acabar e permite repor doces", async () => {
    const h = await service.createHouse(input, "admin"),
      { cookie } = await resident(h.id);
    for (const status of ["ACTIVE", "EMPTY", "ACTIVE"]) {
      const changed = await request(
        "/resident/status",
        "POST",
        { status },
        cookie,
      );
      expect(changed.status).toBe(200);
      expect(changed.data.house.status).toBe(status);
      expect((await request("/houses")).data.houses[0].status).toBe(status);
    }
    expect((await service.events()).map((e) => e.action)).toEqual([
      "distribution.resumed",
      "distribution.stopped",
      "distribution.started",
      "access.issued",
      "house.created",
    ]);
  });
  it("impede desativação antes da primeira ativação", async () => {
    const h = await service.createHouse(input, "admin"),
      { cookie } = await resident(h.id);
    expect(
      (await request("/resident/status", "POST", { status: "EMPTY" }, cookie))
        .status,
    ).toBe(409);
    expect((await service.house(h.id)).status).toBe("PENDING");
  });
  it("token só controla sua própria casa mesmo com outro id no corpo", async () => {
    const one = await service.createHouse(input, "admin"),
      two = await service.createHouse({ ...input, number: "1001" }, "admin"),
      { cookie } = await resident(one.id);
    await request(
      "/resident/status",
      "POST",
      { status: "ACTIVE", houseId: two.id },
      cookie,
    );
    expect((await service.house(one.id)).status).toBe("ACTIVE");
    expect((await service.house(two.id)).status).toBe("PENDING");
    const identity = await service.identity(cookie.split("=")[1]);
    await expect(
      service.setStatus(two.id, "ACTIVE", identity!),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await request(
          `/admin/houses/${two.id}/status`,
          "POST",
          { status: "ACTIVE" },
          cookie,
        )
      ).status,
    ).toBe(401);
  });
  it("revogação invalida token, sessão aberta e identidade previamente obtida", async () => {
    const h = await service.createHouse(input, "admin"),
      { token, cookie } = await resident(h.id),
      id = await service.identity(cookie.split("=")[1]);
    await service.revokeLink(h.id, "admin");
    expect((await request("/resident/access", "POST", { token })).status).toBe(
      401,
    );
    expect(
      (await request("/resident/house", "GET", undefined, cookie)).status,
    ).toBe(401);
    expect(
      (await request("/resident/status", "POST", { status: "ACTIVE" }, cookie))
        .status,
    ).toBe(401);
    await expect(service.setStatus(h.id, "ACTIVE", id!)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("gerar novo link invalida o anterior e suas sessões", async () => {
    const h = await service.createHouse(input, "admin"),
      old = await resident(h.id),
      fresh = await resident(h.id);
    expect(
      (await request("/resident/access", "POST", { token: old.token })).status,
    ).toBe(401);
    expect(
      (await request("/resident/house", "GET", undefined, old.cookie)).status,
    ).toBe(401);
    expect(
      (await request("/resident/house", "GET", undefined, fresh.cookie)).status,
    ).toBe(200);
  });
  it("recusa tokens inventados e expirados", async () => {
    expect(
      (await request("/resident/access", "POST", { token: secret() })).status,
    ).toBe(401);
    const h = await service.createHouse(input, "admin"),
      { token, cookie } = await resident(h.id);
    await db.query(
      "UPDATE access_tokens SET expires_at=now()-interval '1 minute'",
    );
    expect((await request("/resident/access", "POST", { token })).status).toBe(
      401,
    );
    expect(
      (await request("/resident/house", "GET", undefined, cookie)).status,
    ).toBe(401);
  });
  it("não expõe segredos no mapa, histórico ou armazenamento", async () => {
    const h = await service.createHouse(input, "admin"),
      { token, cookie } = await resident(h.id);
    await request("/resident/status", "POST", { status: "ACTIVE" }, cookie);
    const publicData = JSON.stringify((await request("/houses")).data);
    expect(publicData).not.toMatch(/token|hash|password|session/);
    expect(publicData).not.toContain(token);
    expect(JSON.stringify(await service.events())).not.toContain(token);
    expect(
      (
        await db.query<{ token_hash: string }>(
          "SELECT token_hash FROM access_tokens",
        )
      ).rows[0].token_hash,
    ).toBe(digest(token));
  });
  it("protege administração e histórico e encerra sessão no logout", async () => {
    for (const path of ["/admin/me", "/admin/state", "/admin/events"])
      expect((await request(path)).status).toBe(401);
    expect(
      (
        await request("/admin/login", "POST", {
          email: "admin@example.com",
          password: "wrong",
        })
      ).status,
    ).toBe(401);
    const cookie = await admin();
    expect(
      (await request("/admin/state", "GET", undefined, cookie)).status,
    ).toBe(200);
    const login = await request("/admin/login", "POST", {
      email: "admin@example.com",
      password: adminPassword,
    });
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=Strict");
    await request("/admin/logout", "POST", {}, cookie);
    expect((await request("/admin/me", "GET", undefined, cookie)).status).toBe(
      401,
    );
  });
  it("recusa alterações de outra origem, mesmo autenticado", async () => {
    const cookie = await admin();
    expect(
      (
        await request(
          "/admin/houses",
          "POST",
          input,
          cookie,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/admin/houses", "POST", input, cookie, null)).status,
    ).toBe(403);
    expect(await service.houses()).toEqual([]);
  });
  it("valida endereço, detecta duplicidade e mantém cadastro pendente", async () => {
    const cookie = await admin();
    expect(
      (await request("/admin/houses", "POST", { ...input, cep: "1" }, cookie))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          "/admin/houses",
          "POST",
          { ...input, street: "Rua real" },
          cookie,
        )
      ).status,
    ).toBe(422);
    const first = await request("/admin/houses", "POST", input, cookie);
    expect(first.status).toBe(201);
    expect(first.data.house.status).toBe("PENDING");
    expect((await request("/admin/houses", "POST", input, cookie)).status).toBe(
      409,
    );
  });
  it("grava disponibilidade e auditoria atomicamente", async () => {
    const h = await service.createHouse(input, "admin"),
      cookie = await admin();
    const original = service.audit.bind(service);
    service.audit = async () => {
      throw new Error("simulated audit failure");
    };
    const response = await request(
      `/admin/houses/${h.id}/status`,
      "POST",
      { status: "ACTIVE" },
      cookie,
    );
    service.audit = original;
    expect(response.status).toBe(500);
    expect((await service.house(h.id)).status).toBe("PENDING");
    expect((await service.events()).length).toBe(1);
  });
  it("oculta coordenadas vencidas e revalida ao salvar o cadastro", async () => {
    const h = await service.createHouse(input, "admin");
    await service.setStatus(h.id, "ACTIVE", { kind: "admin", label: "admin" });
    await db.query("UPDATE houses SET geocoded_at=now()-interval '31 days'");
    expect(await service.houses(true)).toEqual([]);
    expect((await service.house(h.id)).lat).toBeNull();
    await expect(
      service.setStatus(h.id, "ACTIVE", { kind: "admin", label: "admin" }),
    ).rejects.toMatchObject({ status: 409 });
    await service.editHouse(h.id, input, "admin");
    expect((await service.house(h.id)).locationValid).toBe(true);
  });
  it("não cria auditorias extras ao repetir o mesmo status", async () => {
    const h = await service.createHouse(input, "admin"),
      { cookie } = await resident(h.id);
    await request("/resident/status", "POST", { status: "ACTIVE" }, cookie);
    await request("/resident/status", "POST", { status: "ACTIVE" }, cookie);
    expect(
      (await service.events()).filter(
        (e) => e.action === "distribution.started",
      ),
    ).toHaveLength(1);
  });
});

describe("Geocodificação de endereços reais", () => {
  const result = {
    partial_match: false,
    place_id: "google-place",
    geometry: {
      location_type: "ROOFTOP",
      location: { lat: -25.4, lng: -49.2 },
    },
    address_components: [
      { types: ["street_number"], long_name: "919" },
      { types: ["country"], short_name: "BR" },
      { types: ["administrative_area_level_1"], short_name: "PR" },
      { types: ["administrative_area_level_2"], long_name: "Curitiba" },
      { types: ["postal_code"], long_name: "80000-000" },
    ],
  };
  afterAll(() => vi.unstubAllGlobals());
  it("não inventa coordenadas quando falta chave", async () => {
    await expect(googleGeocoder()(input)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("aceita somente endereço completo com número e município correspondentes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ status: "OK", results: [result] }),
        }),
    );
    expect(await googleGeocoder("test-key")(input)).toEqual({
      lat: -25.4,
      lng: -49.2,
      placeId: "google-place",
    });
    await expect(
      googleGeocoder("test-key")({ ...input, city: "Pinhais" }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      googleGeocoder("test-key")({ ...input, number: "999" }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      googleGeocoder("test-key")({ ...input, cep: "80000001" }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("recusa resultados aproximados ou ambíguos", async () => {
    for (const results of [
      [{ ...result, partial_match: true }],
      [
        {
          ...result,
          geometry: { ...result.geometry, location_type: "RANGE_INTERPOLATED" },
        },
      ],
      [result, result],
      [],
    ]) {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({
            ok: true,
            json: async () => ({ status: "OK", results }),
          }),
      );
      await expect(googleGeocoder("test-key")(input)).rejects.toMatchObject({
        status: 422,
      });
    }
  });
});
