import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  findPort,
  prepareConfiguration,
  readOptions,
  runtimeEnvironment,
} from "../scripts/local.mjs";
const directories: string[] = [];
async function directory() {
  const p = await mkdtemp(join(tmpdir(), "trickortrack local "));
  directories.push(p);
  return p;
}
afterEach(async () => {
  for (const p of directories.splice(0))
    await rm(p, { recursive: true, force: true });
});
describe("Preparação local", () => {
  it("gera credenciais privadas uma vez e preserva o arquivo real", async () => {
    const root = await directory(),
      sentinel =
        "DATABASE_URL=postgresql://example.invalid/real\nAPP_DEMO_MODE=false\n";
    await writeFile(join(root, ".env.local"), sentinel);
    const first = await prepareConfiguration(root),
      bytes = await readFile(join(root, ".env.local-test"), "utf8");
    expect(first.password).toHaveLength(24);
    expect(first.email).toBe("admin@trickortrack.local");
    expect(await prepareConfiguration(root)).toEqual(first);
    expect(await readFile(join(root, ".env.local-test"), "utf8")).toBe(bytes);
    expect(await readFile(join(root, ".env.local"), "utf8")).toBe(sentinel);
    if (process.platform !== "win32")
      expect((await stat(join(root, ".env.local-test"))).mode & 0o777).toBe(
        0o600,
      );
  });
  it("não sobrescreve configurações existentes inválidas", async () => {
    const root = await directory(),
      value = "ADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=curta\n";
    await writeFile(join(root, ".env.local-test"), value);
    await expect(prepareConfiguration(root)).rejects.toThrow(
      "arquivo existente foi preservado",
    );
    expect(await readFile(join(root, ".env.local-test"), "utf8")).toBe(value);
  });
  it("isola banco, modo, build e chaves mesmo herdando ambiente de produção", async () => {
    const env = runtimeEnvironment(
      "/project",
      { email: "admin@example.com", password: "only-for-tests" },
      3001,
      {
        NODE_ENV: "production",
        APP_DEMO_MODE: "false",
        DATABASE_URL: "postgresql://example.invalid/real",
        GOOGLE_MAPS_BROWSER_KEY: "real-key",
        GOOGLE_MAPS_MAP_ID: "real-id",
        GOOGLE_MAPS_GEOCODING_KEY: "real-secret",
      },
    );
    expect(env).toMatchObject({
      NODE_ENV: "development",
      APP_DEMO_MODE: "true",
      DATABASE_URL: "",
      GOOGLE_MAPS_BROWSER_KEY: "",
      GOOGLE_MAPS_MAP_ID: "",
      GOOGLE_MAPS_GEOCODING_KEY: "",
      PORT: "3001",
      APP_URL: "http://localhost:3001",
      NEXT_DIST_DIR: ".next-local-test",
    });
    expect(env.PGLITE_PATH).toBe(join("/project", ".data", "local-test"));
  });
  it("procura outra porta se a preferida já está ocupada", async () => {
    const port = await findPort(22000),
      server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    try {
      expect(await findPort(port)).toBeGreaterThan(port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("rejeita portas inválidas sem iniciar processos", async () => {
    const root = await directory();
    for (const port of ["abc", "0", "65536"]) {
      await writeFile(
        join(root, ".env.local-test"),
        `ADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=test-long-password\nPORT=${port}\n`,
      );
      await expect(prepareConfiguration(root)).rejects.toThrow("PORT");
    }
  });
  it("oferece preparação sem navegador e rejeita opções desconhecidas", () => {
    expect(readOptions(["--prepare-only", "--no-open"])).toMatchObject({
      prepareOnly: true,
      open: false,
    });
    expect(readOptions([])).toMatchObject({ prepareOnly: false, open: true });
    expect(() => readOptions(["--reset"])).toThrow("Opção desconhecida");
  });
});
