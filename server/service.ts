import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database, SQL } from "./db";
import {
  AppError,
  demoGeocoder,
  demoNumbers,
  googleGeocoder,
  type Geocoder,
} from "./geocoding";
import { digest, hashPassword, secret, verifyPassword } from "./security";
import type { House, AuditEvent } from "../lib/types";

export const houseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  note: z.string().trim().max(300).default(""),
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{8}$/)),
  street: z.string().trim().min(3).max(150),
  number: z.string().trim().min(1).max(12),
  neighborhood: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
    ),
});
const houseSelect = `SELECT id, name, note, cep, street, number, neighborhood, city, state, status,
 CASE WHEN geocoded_at > now() - interval '30 days' THEN lat ELSE NULL END AS lat,
 CASE WHEN geocoded_at > now() - interval '30 days' THEN lng ELSE NULL END AS lng,
 updated_at AS "updatedAt", activated_at AS "activatedAt",
 (geocoded_at > now() - interval '30 days' AND lat IS NOT NULL AND lng IS NOT NULL) AS "locationValid" FROM houses`;
const addressKey = (a: z.infer<typeof houseSchema>) =>
  digest(
    [a.cep, a.street, a.number, a.city, a.state]
      .join("|")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " "),
  );
export interface Identity {
  kind: "admin" | "resident";
  label: string;
  adminId?: string;
  houseId?: string;
  tokenId?: string;
}
export interface ServiceOptions {
  demo: boolean;
  adminEmail: string;
  adminPassword: string;
  geocodingKey?: string;
  geocode?: Geocoder;
}
export class Service {
  geocode: Geocoder;
  constructor(
    public db: Database,
    public options: ServiceOptions,
  ) {
    this.geocode =
      options.geocode ??
      (options.demo ? demoGeocoder : googleGeocoder(options.geocodingKey));
  }
  async audit(
    tx: SQL,
    houseId: string,
    action: string,
    actor: string,
    details = {},
  ) {
    await tx.query(
      "INSERT INTO audit_events(house_id,action,actor,details) VALUES($1,$2,$3,$4)",
      [houseId, action, actor, JSON.stringify(details)],
    );
  }
  async bootstrap() {
    const admins = await this.db.query("SELECT id FROM admins LIMIT 1");
    if (!admins.rows.length)
      await this.db.query(
        "INSERT INTO admins(id,email,password_hash) VALUES($1,$2,$3)",
        [
          randomUUID(),
          this.options.adminEmail.toLowerCase(),
          hashPassword(this.options.adminPassword),
        ],
      );
    if (
      !this.options.demo ||
      (await this.db.query("SELECT id FROM houses LIMIT 1")).rows.length
    )
      return;
    const names = [
      "O casarão das abóboras",
      "Doçuras da família Addams",
      "O refúgio da bruxa",
      "A casa dos fantasminhas",
      "O covil do morcego",
      "A toca das aranhas",
      "O jardim encantado",
      "A mansão do susto",
    ];
    const statuses = [
      "ACTIVE",
      "ACTIVE",
      "EMPTY",
      "ACTIVE",
      "PENDING",
      "ACTIVE",
      "EMPTY",
      "PENDING",
    ];
    for (let i = 0; i < names.length; i++) {
      const h = await this.createHouse(
        {
          name: names[i],
          note: [
            "Os doces esperam vocês no portão!",
            "Bata palmas e prepare sua sacolinha.",
            "Voltamos assim que repusermos os doces.",
            "Pode vir com sua melhor fantasia!",
          ][i % 4],
          cep: "80000000",
          street: "Rua das Abóboras",
          number: demoNumbers[i],
          neighborhood: "Lua Nova (fictício)",
          city: "Curitiba",
          state: "PR",
        },
        "Demonstração",
      );
      if (statuses[i] !== "PENDING") {
        await this.setStatus(h.id, "ACTIVE", {
          kind: "admin",
          label: "Demonstração",
        });
        if (statuses[i] === "EMPTY")
          await this.setStatus(h.id, "EMPTY", {
            kind: "admin",
            label: "Demonstração",
          });
      }
    }
  }
  async houses(publicOnly = false) {
    const result = await this.db.query<House>(
      `${houseSelect} ${publicOnly ? "WHERE status <> 'PENDING' AND geocoded_at > now() - interval '30 days' AND lat IS NOT NULL AND lng IS NOT NULL" : ""} ORDER BY created_at, id`,
    );
    return result.rows;
  }
  async house(id: string) {
    const h = (await this.db.query<House>(`${houseSelect} WHERE id=$1`, [id]))
      .rows[0];
    if (!h) throw new AppError(404, "Casa não encontrada.");
    return h;
  }
  async createHouse(input: unknown, actor: string) {
    const a = houseSchema.parse(input),
      point = await this.geocode(a),
      id = randomUUID();
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO houses(id,name,note,cep,street,number,neighborhood,city,state,address_key,lat,lng,place_id,geocoded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())",
          [
            id,
            a.name,
            a.note,
            a.cep,
            a.street,
            a.number,
            a.neighborhood,
            a.city,
            a.state,
            addressKey(a),
            point.lat,
            point.lng,
            point.placeId,
          ],
        );
        await this.audit(tx, id, "house.created", actor);
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new AppError(409, "Este endereço já está cadastrado.");
      throw e;
    }
    return this.house(id);
  }
  async editHouse(id: string, input: unknown, actor: string) {
    const old = await this.house(id),
      a = houseSchema.parse(input);
    const changedAddress = [
      "cep",
      "street",
      "number",
      "neighborhood",
      "city",
      "state",
    ].some((k) => a[k as keyof typeof a] !== old[k as keyof House]);
    const point =
      changedAddress || !old.locationValid ? await this.geocode(a) : null;
    try {
      await this.db.transaction(async (tx) => {
        await tx.query("SELECT id FROM houses WHERE id=$1 FOR UPDATE", [id]);
        await tx.query(
          "UPDATE houses SET name=$2,note=$3,cep=$4,street=$5,number=$6,neighborhood=$7,city=$8,state=$9,address_key=$10,updated_at=now() WHERE id=$1",
          [
            id,
            a.name,
            a.note,
            a.cep,
            a.street,
            a.number,
            a.neighborhood,
            a.city,
            a.state,
            addressKey(a),
          ],
        );
        if (point)
          await tx.query(
            "UPDATE houses SET lat=$2,lng=$3,place_id=$4,geocoded_at=now() WHERE id=$1",
            [id, point.lat, point.lng, point.placeId],
          );
        await this.audit(tx, id, "house.updated", actor, {
          fields: Object.keys(a).filter(
            (k) => a[k as keyof typeof a] !== old[k as keyof House],
          ),
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new AppError(409, "Este endereço já está cadastrado.");
      throw e;
    }
    return this.house(id);
  }
  async events(before?: string) {
    return (
      await this.db.query<AuditEvent>(
        `SELECT e.id::text AS id,e.house_id AS "houseId",h.name AS "houseName",e.action,e.actor,e.details,e.created_at AS "createdAt" FROM audit_events e JOIN houses h ON h.id=e.house_id ${before ? "WHERE e.id < $1" : ""} ORDER BY e.id DESC LIMIT 100`,
        before ? [before] : [],
      )
    ).rows;
  }
  async login(email: string, password: string) {
    const admin = (
      await this.db.query<{ id: string; password_hash: string }>(
        "SELECT id,password_hash FROM admins WHERE email=$1",
        [email.toLowerCase()],
      )
    ).rows[0];
    // Perform the same password operation even if the email is not registered.
    if (
      !verifyPassword(
        password,
        admin?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
      ) ||
      !admin
    )
      throw new AppError(401, "E-mail ou senha incorretos.");
    const token = secret();
    await this.db.query(
      "INSERT INTO sessions(id_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
      [digest(token), admin.id],
    );
    return token;
  }
  async identity(session?: string): Promise<Identity | null> {
    if (!session || session.length > 100) return null;
    const row = (
      await this.db.query<{
        admin_id: string | null;
        email: string;
        house_id: string;
        token_id: string;
      }>(
        `SELECT s.admin_id,a.email,t.house_id,t.id AS token_id FROM sessions s LEFT JOIN admins a ON a.id=s.admin_id LEFT JOIN access_tokens t ON t.id=s.access_token_id WHERE s.id_hash=$1 AND s.expires_at>now() AND (s.admin_id IS NOT NULL OR (t.revoked_at IS NULL AND t.expires_at>now()))`,
        [digest(session)],
      )
    ).rows[0];
    return row
      ? row.admin_id
        ? { kind: "admin", adminId: row.admin_id, label: row.email }
        : {
            kind: "resident",
            tokenId: row.token_id,
            houseId: row.house_id,
            label: "Link da casa",
          }
      : null;
  }
  async logout(session?: string) {
    if (session)
      await this.db.query("DELETE FROM sessions WHERE id_hash=$1", [
        digest(session),
      ]);
  }
  async issueLink(id: string, actor: string) {
    await this.house(id);
    const token = secret(),
      tokenId = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM houses WHERE id=$1 FOR UPDATE", [id]);
      await tx.query(
        "DELETE FROM sessions WHERE access_token_id IN (SELECT id FROM access_tokens WHERE house_id=$1)",
        [id],
      );
      await tx.query(
        "UPDATE access_tokens SET revoked_at=now() WHERE house_id=$1 AND revoked_at IS NULL",
        [id],
      );
      await tx.query(
        "INSERT INTO access_tokens(id,house_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",
        [tokenId, id, digest(token)],
      );
      await this.audit(tx, id, "access.issued", actor);
    });
    return token;
  }
  async revokeLink(id: string, actor: string) {
    await this.house(id);
    await this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM houses WHERE id=$1 FOR UPDATE", [id]);
      await tx.query(
        "DELETE FROM sessions WHERE access_token_id IN (SELECT id FROM access_tokens WHERE house_id=$1)",
        [id],
      );
      await tx.query(
        "UPDATE access_tokens SET revoked_at=now() WHERE house_id=$1 AND revoked_at IS NULL",
        [id],
      );
      await this.audit(tx, id, "access.revoked", actor);
    });
  }
  async exchange(token: string) {
    const session = secret();
    await this.db.transaction(async (tx) => {
      // Lock the house before authorizing, in the same order used by revocation.
      const candidate = (
        await tx.query<{ house_id: string }>(
          "SELECT house_id FROM access_tokens WHERE token_hash=$1",
          [digest(token)],
        )
      ).rows[0];
      if (!candidate)
        throw new AppError(
          401,
          "Link inválido, revogado ou expirado. Peça um novo link à organização.",
        );
      await tx.query("SELECT id FROM houses WHERE id=$1 FOR UPDATE", [
        candidate.house_id,
      ]);
      const t = (
        await tx.query<{ id: string }>(
          "SELECT id FROM access_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
          [digest(token)],
        )
      ).rows[0];
      if (!t)
        throw new AppError(
          401,
          "Link inválido, revogado ou expirado. Peça um novo link à organização.",
        );
      await tx.query(
        "INSERT INTO sessions(id_hash,access_token_id,expires_at) SELECT $1,id,LEAST(expires_at,now()+interval '30 days') FROM access_tokens WHERE id=$2",
        [digest(session), t.id],
      );
    });
    return session;
  }
  async setStatus(id: string, status: "ACTIVE" | "EMPTY", identity: Identity) {
    await this.db.transaction(async (tx) => {
      const old = (
        await tx.query<{
          status: string;
          activated_at: Date | null;
          geocoded_at: Date;
        }>(
          "SELECT status,activated_at,geocoded_at FROM houses WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!old) throw new AppError(404, "Casa não encontrada.");
      if (identity.kind === "resident") {
        if (identity.houseId !== id)
          throw new AppError(403, "Este link não controla essa casa.");
        const valid = await tx.query(
          "SELECT id FROM access_tokens WHERE id=$1 AND house_id=$2 AND revoked_at IS NULL AND expires_at>now()",
          [identity.tokenId, id],
        );
        if (!valid.rows.length)
          throw new AppError(401, "Seu link foi revogado ou expirou.");
      }
      if (status === "EMPTY" && !old.activated_at && old.status === "PENDING")
        throw new AppError(409, "A distribuição ainda não começou.");
      if (
        status === "ACTIVE" &&
        new Date(old.geocoded_at).getTime() <= Date.now() - 30 * 86400000
      )
        throw new AppError(
          409,
          "O endereço precisa ser revalidado pela organização.",
        );
      if (old.status === status) return;
      await tx.query(
        "UPDATE houses SET status=$2,activated_at=COALESCE(activated_at,now()),updated_at=now() WHERE id=$1",
        [id, status],
      );
      const action =
        status === "EMPTY"
          ? "distribution.stopped"
          : old.activated_at
            ? "distribution.resumed"
            : "distribution.started";
      await this.audit(tx, id, action, identity.label, {
        from: old.status,
        to: status,
      });
    });
    return this.house(id);
  }
  async refreshLocations() {
    if (this.options.demo) return;
    const stale = await this.db.query<House>(
      "SELECT id,name,note,cep,street,number,neighborhood,city,state FROM houses WHERE geocoded_at < now()-interval '29 days' OR geocoded_at IS NULL LIMIT 50",
    );
    for (const h of stale.rows) {
      try {
        const p = await this.geocode(h);
        await this.db.query(
          "UPDATE houses SET lat=$2,lng=$3,place_id=$4,geocoded_at=now() WHERE id=$1",
          [h.id, p.lat, p.lng, p.placeId],
        );
      } catch {
        /* Expired coordinates are hidden by houseSelect until a successful refresh. */
      }
    }
    await this.db.query(
      "UPDATE houses SET lat=NULL,lng=NULL WHERE geocoded_at <= now()-interval '30 days'",
    );
  }
}
