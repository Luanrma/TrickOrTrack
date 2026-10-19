export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "Não foi possível concluir a solicitação.");
  return body as T;
}
export const post = (body: unknown = {}) => ({
  method: "POST",
  body: JSON.stringify(body),
});
export const time = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
