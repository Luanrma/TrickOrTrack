# TrickOrTrack

Mapa do Halloween do bairro: encontre as casas participantes, veja onde ainda há doces e escolha um personagem para acompanhar sua localização.

## Rodar localmente

Requer Node.js 22.17+ (ou Node.js 24 LTS) e npm. Não precisa de Docker ou de instalar PostgreSQL para a demonstração.

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. A organização acessa http://localhost:3000/admin.

Na primeira execução, `setup` cria `.env.local`, gera uma senha aleatória e a mostra no terminal. O e-mail inicial é `admin@trickortrack.local`. Se precisar consultar a senha novamente, veja `ADMIN_PASSWORD` nesse arquivo local. Ele nunca deve ser commitado.

O banco da demonstração persiste em `.data/pglite-demo`. Reiniciar mantém os cadastros e estados. A demonstração inclui oito casas fictícias (quatro com doces, duas sem doces, duas ainda não ativadas) e um mapa ilustrativo, sinalizado na tela.

## Experimentar o fluxo

1. Entre na organização e cadastre uma casa. Em demonstração, use **Preencher endereço de demonstração**; há quatro endereços adicionais disponíveis.
2. No gerenciamento da casa, clique em **Gerar novo link exclusivo**. Copie o link; o token não poderá ser consultado depois. Gerar outro link revoga o anterior.
3. Abra o link em outro navegador ou janela anônima. Abrir o controle não inicia a distribuição.
4. Toque em **Começar a distribuir**. A casa aparece no mapa público.
5. Toque em **Acabaram os doces**: o marcador vira uma lápide. **Voltamos! Temos doces** restaura a casa.
6. Confira as mudanças no mapa público e no histórico administrativo, sem recarregar as páginas.
7. Revogue o link na organização: o link antigo e suas sessões abertas perdem a autorização.

O painel tem lista, mapa e histórico. Os filtros mostram todas as casas, com doces, sem doces ou ainda não ativadas. Somente a organização vê casas pendentes. O histórico registra autor/origem, horário e transição de status; também inclui cadastro, edição e geração/revogação de acesso.

## Google Maps e endereços reais

A demonstração funciona sem credenciais. Para trabalhar com endereços reais, configure `.env.local`:

```dotenv
APP_DEMO_MODE=false
GOOGLE_MAPS_BROWSER_KEY=sua_chave_para_o_navegador
GOOGLE_MAPS_MAP_ID=seu_map_id_javascript
GOOGLE_MAPS_GEOCODING_KEY=sua_chave_para_o_servidor
```

No Google Cloud:

- Habilite **Maps JavaScript API** e **Geocoding API**, com faturamento e cotas configurados.
- Restrinja a chave do navegador por sites de origem e exclusivamente à Maps JavaScript API. Para teste local, autorize `http://localhost:3000/*`.
- Use uma chave separada para Geocoding, restrita a essa API e aos IPs de saída do servidor quando disponíveis. Essa chave não é enviada ao navegador.
- Crie um Map ID de JavaScript. A aplicação usa o modo escuro; cores mais específicas podem ser definidas no estilo associado ao Map ID no Google Cloud.

Reinicie o servidor. O banco real local é separado (`.data/pglite`); dados fictícios não migram para ele. Em PostgreSQL externo, use bancos distintos. O servidor verifica o modo gravado no banco e recusa misturar demonstração e dados reais.

O endereço inclui CEP, rua, número, bairro, cidade e UF. O cadastro consulta Geocoding no servidor e só aceita resultado único, não parcial, com precisão `ROOFTOP`, número, município, UF e CEP correspondentes. Resultados aproximados ficam impedidos de cadastro, com uma mensagem para corrigir o endereço. Não há posicionamento manual nem coordenadas inventadas para casas reais. A disponibilidade desses dados depende da cobertura do Google na região.

Coordenadas vencem após 30 dias, são removidas da resposta pública e passam por renovação automática a partir do dia 29. Se a renovação falhar, a organização pode salvar novamente o cadastro para revalidar. Place IDs permanecem armazenados. Revise os termos aplicáveis do Google antes da publicação.

Documentação: [marcadores](https://developers.google.com/maps/documentation/javascript/advanced-markers/graphic-markers), [Map IDs](https://developers.google.com/maps/documentation/javascript/map-ids/mapid-over), [políticas de Geocoding](https://developers.google.com/maps/documentation/geocoding/policies).

## Arquitetura

- **Next.js / React / TypeScript**: mapa, organização, controle do morador, privacidade e termos.
- **CSS responsivo e SVGs próprios**: tema Halloween e seis avatares (abóbora, bruxa, caveira, aranha, morcego, máscara de hóquei), sem fontes ou imagens externas na demonstração.
- **Node.js / Express**: API autenticada e integração de endereços; Next.js compartilha o mesmo servidor HTTP.
- **PostgreSQL**: PGlite para desenvolvimento local ou PostgreSQL externo por `DATABASE_URL`; migração SQL versionada.
- **Socket.IO**: atualizações automáticas. Alterações próximas são agrupadas numa janela de 200 ms. O cliente recebe um retrato do estado público, inclusive após reconectar; sem WebSocket, há consulta periódica a cada 15 segundos.

A localização do visitante fica no dispositivo. O servidor recebe apenas mudanças das casas; não há compartilhamento de trajetos. No mapa ilustrativo, o personagem é uma prévia de posição, explicitamente identificada. No mapa real, acompanha o GPS com indicador de precisão. O botão **Minha localização** recentraliza. A fantasia escolhida persiste no navegador.

### Autorização

- Administradores têm sessão HTTP-only de 12 horas; senhas recebem salt e scrypt.
- Links usam tokens aleatórios de 256 bits, associados a uma única casa, com validade de 30 dias. O banco armazena somente seu hash SHA-256.
- O token vai no fragmento (`/casa#token=…`), é trocado por sessão HTTP-only e removido da barra de endereço. O fragmento não vai nos acessos HTTP ao site.
- Toda leitura/alteração protegida valida a sessão. Alterações do morador também revalidam o token dentro da transação, com o mesmo bloqueio usado para revogação.
- Revogação/rotação invalida também as sessões abertas. Cookies SameSite Strict, checagem de Origin nas escritas, limitação de tentativas e respostas sem cache protegem os endpoints.
- Quem possuir o link completo pode controlar a casa. O token não identifica uma pessoa e não impede o uso de uma cópia válida.
- Disponibilidade e histórico são gravados juntos, na mesma transação. Tokens, sessões e auditoria não aparecem nas respostas públicas.

### PostgreSQL externo

Defina `DATABASE_URL=postgresql://usuario:senha@host:5432/trickortrack`. O servidor aplica a migração inicial na abertura. Em produção, exige PostgreSQL externo, `APP_DEMO_MODE=false`, HTTPS em `APP_URL` e configuração completa do Google. Não use PGlite para o evento.

```bash
npm run build
npm start
```

`npm start` usa o servidor customizado, necessário para a API e Socket.IO; não substitua por `next start`. Hospedagem e publicação ficam para a próxima etapa.

## Validação

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes de integração usam um PostgreSQL incorporado descartável. Cobrem visibilidade inicial, ativação/encerramento/reposição, auditoria atômica, isolamento entre casas, revogação e rotação, expiração, autenticação, origem das requisições, duplicidade e validação de geocodificação.

O Playwright inicia um servidor isolado na porta 3100 e usa um banco separado por execução. Exercita desktop e celular: busca/filtros, personagens, geolocalização simulada e o fluxo de organização/morador/visitante em contextos separados. Se já tiver Chromium instalado, pode indicar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

O teste opcional `npm run test:load -- 1000` inicia um servidor e banco fictícios isolados na porta 3101, conecta mil clientes Socket.IO e confere a entrega de uma mudança de status a todos. Ele mede apenas o transporte local; não certifica mil usuários reais carregando mapas nem a futura hospedagem.

## Antes do evento

Esta entrega é uma base local do MVP. Ainda precisam ser realizados: validação do Google Maps com credenciais e endereços reais, escolha da hospedagem, backups, monitoramento e teste de carga na infraestrutura escolhida para a meta de **1.000 dispositivos simultâneos**. Também é preciso definir data/horários, recorte do bairro, responsáveis e retenção dos dados. Os testes locais não certificam a capacidade da futura hospedagem.
