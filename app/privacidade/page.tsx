import { Header } from "@/components/brand";
export default function Page() {
  return (
    <div className="page-shell">
      <Header />
      <main className="legal">
        <span className="eyebrow">TRICKORTRACK</span>
        <h1>Privacidade</h1>
        <p>
          O mapa exibe as casas participantes e a disponibilidade de doces. O
          acesso ao controle de cada casa é restrito ao seu link exclusivo e à
          organização.
        </p>
        <h2>Sua localização</h2>
        <p>
          Se você autorizar, o navegador utiliza sua localização para mostrar
          seu personagem no mapa. O TrickOrTrack não envia essa posição ao seu
          servidor nem armazena seu trajeto. Ao carregar o Google Maps, seu
          navegador também se conecta aos serviços do Google.
        </p>
        <h2>Dados e acesso</h2>
        <p>
          Guardamos endereço, nome da casa, orientações, disponibilidade e
          histórico das alterações. A organização acessa o histórico. Cookies
          essenciais mantêm as sessões de acesso e a escolha de personagem fica
          salva apenas no navegador.
        </p>
        <h2>Serviços Google</h2>
        <p>
          O uso do mapa está sujeito à{" "}
          <a href="https://policies.google.com/privacy" rel="noreferrer">
            Política de Privacidade do Google
          </a>
          .
        </p>
        <h2>Antes da publicação</h2>
        <p>
          Esta é uma versão local de desenvolvimento. A organização deve
          informar seus dados de contato e definir os prazos de retenção e o
          canal de atendimento antes de abrir o evento ao público.
        </p>
        <a className="button secondary" href="/">
          Voltar ao mapa
        </a>
      </main>
    </div>
  );
}
