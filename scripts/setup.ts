import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env.local")) {
  const password = randomBytes(12).toString("base64url");
  writeFileSync(
    ".env.local",
    readFileSync(".env.example", "utf8").replace(
      "ADMIN_PASSWORD=",
      `ADMIN_PASSWORD=${password}`,
    ),
    { mode: 0o600 },
  );
  console.log("\nTrickOrTrack · demonstração local");
  console.log("Administrador: admin@trickortrack.local");
  console.log(`Senha local gerada: ${password}`);
  console.log("Credenciais salvas em .env.local (ignorado pelo Git).\n");
}
