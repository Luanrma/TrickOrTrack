import { test, expect } from "@playwright/test";
const password = "qa-local-test-password-2026";
test("famílias exploram o mapa e escolhem personagem sem cadastro", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: -25.4284,
    longitude: -49.2733,
    accuracy: 12,
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Siga os sustos/ }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Mapa ilustrativo de demonstração, sem endereços reais"),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/map-${test.info().project.name}.png`,
  });
  await page.getByRole("button", { name: "Escolher personagem" }).click();
  await page.getByRole("button", { name: "Morcego", exact: true }).click();
  await page.reload();
  await expect(page.locator(".avatar-toggle img")).toHaveAttribute(
    "src",
    "/art/avatar-bat.svg",
  );
  await page.getByRole("button", { name: "Minha localização" }).click();
  await expect(
    page.getByAltText("Seu personagem", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Acabaram", exact: true }).click();
  await expect(page.locator(".house-list-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.getByLabel("Buscar casa ou rua").fill("Addams");
  await expect(page.locator(".house-list-item")).toHaveCount(1);
  await page.locator(".house-list-item").click();
  await expect(
    page.getByRole("region", { name: "Detalhes da casa" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("cadastro, link, ativação e revogação refletem entre três navegadores", async ({
  page,
  browser,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const visitor = await browser.newContext(),
    resident = await browser.newContext();
  const map = await visitor.newPage(),
    control = await resident.newPage();
  const origin = baseURL!;
  await page.goto("/admin");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("qa@trickortrack.local");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na organização" }).click();
  await expect(
    page.getByRole("heading", { name: "O bairro em suas mãos." }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/admin-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cadastrar casa", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Preencher endereço de demonstração" })
    .click();
  const name = `Casa QA ${Date.now()}`;
  await page.getByLabel("Nome da casa", { exact: true }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cadastrar casa", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await map.goto(origin);
  await expect(
    map.locator(".house-list-item").filter({ hasText: name }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Gerenciar ${name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Gerar novo link exclusivo" }).click();
  const link = await page
    .getByLabel("Link exclusivo", { exact: true })
    .inputValue();
  await control.goto(link);
  await expect(
    control.getByRole("button", { name: "Começar a distribuir" }),
  ).toBeVisible();
  expect(new URL(control.url()).hash).toBe("");
  await control.screenshot({
    path: `test-results/resident-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    map.locator(".house-list-item").filter({ hasText: name }),
  ).toHaveCount(0);
  await control.getByRole("button", { name: "Começar a distribuir" }).click();
  await expect(
    map.locator(".house-list-item").filter({ hasText: name }),
  ).toHaveCount(1);
  await control
    .getByRole("button", { name: "Acabaram os doces", exact: true })
    .click();
  await expect(
    map.locator(".house-list-item").filter({ hasText: name }).locator("img"),
  ).toHaveAttribute("src", "/art/tombstone.svg");
  await control.getByRole("button", { name: "Voltamos! Temos doces" }).click();
  await expect(
    map.locator(".house-list-item").filter({ hasText: name }).locator("img"),
  ).toHaveAttribute("src", "/art/haunted-house.svg");
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Revogar link de controle" }).click();
  await page
    .getByRole("button", { name: "Confirmar revogação do link" })
    .click();
  await expect(
    control.getByRole("heading", { name: "Esta chave não abriu a porta." }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Mapa das casas" }).click();
  await expect(page.getByLabel("Mapa administrativo")).toBeVisible();
  await page.getByRole("button", { name: "Histórico de atividades" }).click();
  await expect(
    page.locator(".activity").filter({ hasText: name }),
  ).not.toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  const state = await page.request.get(`${origin}/api/admin/state`);
  const h = (await state.json()).houses.find(
    (h: { name: string }) => h.name === name,
  );
  expect(h.status).toBe("ACTIVE");
  await visitor.close();
  await resident.close();
});
