import { Header } from "@/components/brand";
export default function Page() {
  return (
    <div className="page-shell">
      <Header />
      <main className="legal">
        <span className="eyebrow">TRICKORTRACK</span>
        <h1>Termos de uso</h1>
        <p>
          O TrickOrTrack ajuda a localizar casas participantes de um evento de
          Halloween. A disponibilidade de doces é informada pelos responsáveis e
          pode mudar entre uma atualização e a chegada à casa.
        </p>
        <h2>Participação</h2>
        <p>
          Respeite os moradores, os horários e as orientações de cada casa.
          Acompanhantes são responsáveis pela supervisão das crianças durante o
          percurso.
        </p>
        <h2>Acesso exclusivo</h2>
        <p>
          Quem possui um link de controle pode alterar a disponibilidade daquela
          casa. Guarde-o com cuidado e solicite a revogação à organização caso
          seja compartilhado por engano.
        </p>
        <h2>Google Maps</h2>
        <p>
          O mapa utiliza a Google Maps Platform. Aplicam-se os{" "}
          <a href="https://maps.google.com/help/terms_maps/" rel="noreferrer">
            Termos de Serviço do Google Maps
          </a>{" "}
          e os{" "}
          <a href="https://policies.google.com/terms" rel="noreferrer">
            Termos do Google
          </a>
          .
        </p>
        <h2>Versão local</h2>
        <p>
          Dados e mapas da demonstração são fictícios. O sistema ainda precisa
          de validação operacional e teste de carga antes de um evento real.
        </p>
        <a className="button secondary" href="/">
          Voltar ao mapa
        </a>
      </main>
    </div>
  );
}
