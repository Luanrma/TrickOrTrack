import type { Address } from "../lib/types";
export interface Location {
  lat: number;
  lng: number;
  placeId: string;
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Geocoder = (address: Address) => Promise<Location>;
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function googleGeocoder(key?: string): Geocoder {
  return async (a) => {
    if (!key)
      throw new AppError(
        503,
        "Configure a chave de Geocoding para cadastrar endereços reais.",
      );
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set(
      "address",
      `${a.street}, ${a.number}, ${a.neighborhood}, ${a.city}, ${a.state}, ${a.cep}, Brasil`,
    );
    url.searchParams.set("components", "country:BR");
    url.searchParams.set("key", key);
    url.searchParams.set("language", "pt-BR");
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new AppError(
        503,
        "Não foi possível consultar o endereço agora. Tente novamente.",
      );
    }
    if (!response.ok)
      throw new AppError(503, "Serviço de endereços indisponível.");
    const body = await response.json();
    if (body.status !== "OK" || body.results?.length !== 1)
      throw new AppError(
        422,
        "Endereço não localizado de forma única. Confira CEP, rua e número.",
      );
    const result = body.results[0];
    const component = (type: string) =>
      result.address_components.find((c: { types: string[] }) =>
        c.types.includes(type),
      );
    if (
      result.partial_match ||
      result.geometry?.location_type !== "ROOFTOP" ||
      normalize(component("street_number")?.long_name ?? "") !==
        normalize(a.number) ||
      component("country")?.short_name !== "BR" ||
      component("administrative_area_level_1")?.short_name !== a.state ||
      normalize(
        component("administrative_area_level_2")?.long_name ??
          component("locality")?.long_name ??
          "",
      ) !== normalize(a.city) ||
      component("postal_code")?.long_name?.replace(/\D/g, "") !== a.cep ||
      !Number.isFinite(result.geometry?.location?.lat) ||
      !Number.isFinite(result.geometry?.location?.lng)
    )
      throw new AppError(
        422,
        "O Google retornou uma localização aproximada. Confira o endereço antes de cadastrar esta casa.",
      );
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      placeId: result.place_id,
    };
  };
}
export const demoNumbers = [
  "131",
  "240",
  "313",
  "404",
  "515",
  "626",
  "717",
  "808",
  "919",
  "1001",
  "1111",
  "1212",
];
export const demoGeocoder: Geocoder = async (a) => {
  const i = demoNumbers.indexOf(a.number);
  if (a.street !== "Rua das Abóboras" || a.cep !== "80000000" || i < 0)
    throw new AppError(
      422,
      "No modo demonstração, use Rua das Abóboras, CEP 80000-000 e um número de exemplo: 919, 1001, 1111 ou 1212. Para endereços reais, configure o Google e desative a demonstração.",
    );
  return {
    lat: -25.4284 + (Math.floor(i / 4) - 1) * 0.0018,
    lng: -49.2733 + ((i % 4) - 1.5) * 0.002,
    placeId: `demo-${i}`,
  };
};
