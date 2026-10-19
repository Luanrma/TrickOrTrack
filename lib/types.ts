export type HouseStatus = "PENDING" | "ACTIVE" | "EMPTY";
export interface Address {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
}
export interface House extends Address {
  id: string;
  name: string;
  note: string;
  status: HouseStatus;
  lat: number | null;
  lng: number | null;
  updatedAt: string;
  activatedAt: string | null;
  locationValid: boolean;
}
export interface AuditEvent {
  id: string;
  houseId: string;
  houseName: string;
  action: string;
  actor: string;
  createdAt: string;
  details: Record<string, unknown>;
}
export interface AppConfig {
  demo: boolean;
  mapsKey: string;
  mapId: string;
  center: { lat: number; lng: number };
  adminEmail?: string;
}
export type Avatar = "pumpkin" | "witch" | "skull" | "spider" | "bat" | "mask";
export const avatarNames: Record<Avatar, string> = {
  pumpkin: "Abóbora",
  witch: "Bruxa",
  skull: "Caveira",
  spider: "Aranha",
  bat: "Morcego",
  mask: "Máscara de hóquei",
};
export const statusLabels: Record<HouseStatus, string> = {
  PENDING: "Ainda não ativou",
  ACTIVE: "Tem doces",
  EMPTY: "Doces acabaram",
};
export const fullAddress = (h: Address) =>
  `${h.street}, ${h.number} · ${h.neighborhood}`;
