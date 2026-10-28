# Pendências antes da produção

Itens que dependem de decisão ou acesso da BrAlveX. Nada aqui foi inventado ou presumido no código.

## Jurídico / privacidade

- [ ] **Controlador dos dados**: razão social, CNPJ e endereço, que aparecem como `[PENDENTE]` em `site/content/pt.js` e `[PENDING]` em `site/content/en.js`.
- [ ] **Base legal** de cada finalidade (avaliação da solicitação; novidades por e-mail).
- [ ] **Prazo de retenção** das solicitações. Depois de definido, preencher `LEAD_RETENTION_DAYS`, agendar `npm run retention -- --apply` e atualizar a política.
- [ ] **Operadores**: provedores de hospedagem e e-mail que processam os dados.
- [ ] Revisão jurídica do aviso do formulário e da política. Ao alterar o texto do aviso, atualizar `PRIVACY_NOTICE_VERSION` em `shared/form-schema.js`, para que cada lead registre a versão vista.
- [ ] A política hoje traz a faixa "versão preliminar em revisão". Remover depois da aprovação.

## Infraestrutura

- [ ] Confirmar se o plano de hospedagem executa **Node.js ≥ 24.22.1** e oferece **MySQL 8+ ou MariaDB 10.6+** (veja `docs/DEPLOY.md`). Hoje `bralvex.com` responde 404 na CDN da Hostinger, e o DNS está na Locaweb.
- [ ] Criar o banco e os usuários (`docs/database-setup.sql`), além do `.env` de produção com segredos novos.
- [ ] Backups automáticos do banco e teste de restauração.
- [ ] **E-mail**: `contact@bralvex.com` foi usado como endereço público. A troca não cria a caixa postal. Confirmar que a caixa existe (o MX aponta para a Hostinger) e, para o aviso de novos leads, informar as credenciais SMTP (`SMTP_*`, `NOTIFY_FROM`). Sem isso, o aviso fica registrado como "não enviado".
- [ ] MFA do painel (opções em `docs/ADMIN.md`).

## Conteúdo

- [ ] Arquivos de fonte Geist: `original-assets/fonts/` está vazio no repositório e no `BrAlveX-site.zip`. O site usa a fonte reserva (Inter/Arial), e cada página gera um 404 de fonte. Se a fonte for desejada, adicionar os `.woff2` (licença OFL) nesse diretório.
- [ ] Revisão nativa do texto em inglês por alguém da BrAlveX.
