# Validação da entrega local — 19/10/2026

- `npm run typecheck`: passou.
- `npm test`: 17 testes de integração passaram, usando PostgreSQL incorporado em memória e requisições HTTP reais à API.
- `npm run build`: passou; todas as cinco páginas da aplicação foram geradas.
- `npm run test:e2e`: 4 testes Playwright passaram, em desktop e celular. Cobrem as três telas e a atualização entre contextos separados.
- `npm run test:load -- 1000`: 1.000 conexões Socket.IO receberam a alteração; p95 de entrega de 270 ms, máximo 271 ms. Conexão inicial p95 de 233 ms. Teste em loopback, no mesmo ambiente, com dados fictícios e PGlite, sem carregar mapas. Não representa a capacidade de uma hospedagem contratada.

Foi utilizado Chromium headless local nos testes de navegador. A revisão visual incluiu mapa, painel administrativo e controle da casa. A posição GPS foi simulada pelo navegador. O transporte dos painéis foi ajustado para iniciar por WebSocket e também aceitar consultas de transporte HTTP da própria origem.

A integração real do Google permanece configurável e precisa ser validada com chaves e endereços do evento. Não foram fornecidas credenciais de Google Maps. Geocoding foi validado com respostas simuladas, incluindo endereço correto, número/CEP/município divergentes, resposta parcial e precisão aproximada.

A implementação é entregue na branch `feat/local-mvp`, com revisão por pull request. Senhas locais, bancos, dependências instaladas e resultados temporários dos testes não fazem parte do código versionado. Hospedagem não foi configurada nesta entrega.
