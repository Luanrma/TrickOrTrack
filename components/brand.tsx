import Link from "next/link";
import { ArrowUpRight, Ghost } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="TrickOrTrack, início">
      <span className="brand-mark">
        <Ghost size={26} strokeWidth={2.6} />
      </span>
      <span>
        trick<span className="brand-or">or</span>track
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Header({ admin = false }: { admin?: boolean }) {
  return (
    <header className="site-header">
      <Brand />
      <span className="header-caption">
        UM BAIRRO. MUITOS DOCES. ALGUNS SUSTOS.
      </span>
      <Link href={admin ? "/" : "/admin"} className="header-link">
        {admin ? "Voltar ao mapa" : "Sou da organização"}
        <ArrowUpRight size={16} />
      </Link>
    </header>
  );
}
