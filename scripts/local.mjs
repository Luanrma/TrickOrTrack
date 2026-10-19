import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export function readOptions(args) {
  const allowed = new Set(["--no-open", "--prepare-only", "--help"]);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) throw new Error(`Opção desconhecida: ${unknown}. Use --help.`);
  return {
    open: !args.includes("--no-open"),
    prepareOnly: args.includes("--prepare-only"),
    help: args.includes("--help"),
  };
}

export async function prepareConfiguration(root) {
  const file = join(root, ".env.local-test");
  try {
    await writeFile(
      file,
      `# Ambiente local de testes. Não compartilhe esta senha.\nADMIN_EMAIL=admin@trickortrack.local\nADMIN_PASSWORD=${randomBytes(18).toString("base64url")}\nPORT=3000\n`,
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const config = parseEnv(await readFile(file, "utf8"));
  if (
    !config.ADMIN_EMAIL?.includes("@") ||
    !config.ADMIN_PASSWORD ||
    config.ADMIN_PASSWORD.length < 12
  )
    throw new Error(
      "Confira ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) em .env.local-test. O arquivo existente foi preservado.",
    );
  const port = Number(config.PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error(
      "PORT em .env.local-test deve ser um número entre 1024 e 65535.",
    );
  return { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD, port };
}

export function runtimeEnvironment(root, config, port, parent = process.env) {
  // Sobrescrever explicitamente: dotenv não pode conectar este teste a um banco externo ou carregar chaves reais.
  return {
    ...parent,
    NODE_ENV: "development",
    APP_DEMO_MODE: "true",
    DATABASE_URL: "",
    PGLITE_PATH: join(root, ".data", "local-test"),
    NEXT_DIST_DIR: ".next-local-test",
    GOOGLE_MAPS_BROWSER_KEY: "",
    GOOGLE_MAPS_MAP_ID: "",
    GOOGLE_MAPS_GEOCODING_KEY: "",
    APP_URL: `http://localhost:${port}`,
    HOST: "127.0.0.1",
    PORT: String(port),
    ADMIN_EMAIL: config.email,
    ADMIN_PASSWORD: config.password,
  };
}

export async function findPort(preferred) {
  for (let port = preferred; port <= Math.min(preferred + 20, 65535); port++) {
    const available = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", (error) =>
        error.code === "EADDRINUSE" ? resolve(false) : reject(error),
      );
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("Não há porta disponível. Altere PORT em .env.local-test.");
}

async function runNpm(root, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      args,
      { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
    );
    child.once("error", () =>
      reject(
        new Error(
          "Não foi possível executar npm. Rode iniciar-local.sh ou iniciar-local.cmd.",
        ),
      ),
    );
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `npm ${args.join(" ")} não concluiu (${signal || code}). Confira a conexão com a internet e execute novamente.`,
            ),
          ),
    );
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 8000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    if (child.connected)
      child.send({ type: "local:shutdown" }, (error) => {
        if (error) child.kill("SIGTERM");
      });
    else child.kill("SIGTERM");
  });
}

async function waitUntilReady(child, port) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        "O aplicativo encerrou antes de ficar pronto. Confira a mensagem acima.",
      );
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).ok === true) return;
    } catch {
      /* O banco e o Next.js ainda estão iniciando. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    "O aplicativo demorou mais de 90 segundos para iniciar. Confira as mensagens acima e execute novamente.",
  );
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? "rundll32.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => console.log(`Abra o navegador em ${url}`));
  child.unref();
}

export async function main(args = process.argv.slice(2)) {
  const options = readOptions(args);
  if (options.help) {
    console.log(
      "TrickOrTrack — preparar e iniciar os testes locais\n\nLinux/macOS: bash iniciar-local.sh [opções]\nWindows: iniciar-local.cmd [opções]\n\n--no-open       Não abrir o navegador\n--prepare-only  Preparar, verificar a API e encerrar\n--help          Mostrar esta ajuda\n\nBanco, credenciais e casas fictícias persistem entre execuções.",
    );
    return;
  }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!((major === 22 && minor >= 17) || major >= 24))
    throw new Error(
      "Use iniciar-local.sh ou iniciar-local.cmd para preparar Node.js 24 LTS.",
    );
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(
    "\nTrickOrTrack · preparando a demonstração local\n[1/3] Instalando dependências do projeto…",
  );
  await runNpm(root, ["ci", "--include=dev", "--no-audit", "--no-fund"]);
  console.log("[2/3] Preparando credenciais e banco de testes…");
  const config = await prepareConfiguration(root);
  await mkdir(join(root, ".data", "local-test"), { recursive: true });
  const port = await findPort(config.port);
  if (port !== config.port)
    console.log(`A porta ${config.port} está ocupada. Usando a porta ${port}.`);
  console.log("[3/3] Iniciando o banco, as casas fictícias e a aplicação…");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      cwd: root,
      env: runtimeEnvironment(root, config, port),
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    },
  );
  let stopping = false;
  const interrupt = () => {
    stopping = true;
    void stop(child);
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    await waitUntilReady(child, port);
    const url = `http://localhost:${port}`;
    console.log(
      `\nAmbiente pronto!\nMapa: ${url}\nOrganização: ${url}/admin\nE-mail: ${config.email}\nSenha de teste: ${config.password}\n\nDemonstração com endereços fictícios, sem Google Maps ou banco externo.\nCredenciais: .env.local-test · Banco: .data/local-test\n`,
    );
    if (options.prepareOnly) {
      await stop(child);
      console.log(
        "Preparação concluída e API verificada. Execute novamente sem --prepare-only para abrir o aplicativo.",
      );
      return;
    }
    if (options.open) openBrowser(url);
    console.log(
      "Mantenha este terminal aberto. Para encerrar, pressione Ctrl+C.\n",
    );
    const result = await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null)
        resolve(child.exitCode);
      else child.once("exit", resolve);
    });
    if (result !== 0 && !stopping)
      throw new Error(
        "O aplicativo encerrou com erro. Confira as mensagens acima.",
      );
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await stop(child);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(`\nNão foi possível preparar o ambiente: ${error.message}`);
    process.exitCode = 1;
  });
}
