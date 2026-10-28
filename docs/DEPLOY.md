# Publicação, operação e backups

## Arquitetura

```
Navegador ──HTTPS──> Node.js (Express 5) ──127.0.0.1──> MySQL/MariaDB
                      ├─ site estático gerado em dist/ (/pt, /en)
                      ├─ POST /api/leads  (valida, grava e responde)
                      └─ /admin/*         (painel autenticado)
```

O navegador nunca acessa o banco. Somente o processo Node conecta ao MySQL, com um usuário restrito a `SELECT/INSERT/UPDATE/DELETE`.

## Requisitos da hospedagem

| Recurso | Necessário |
| --- | --- |
| Runtime | Node.js **24.22.1 ou superior** (LTS com as correções de segurança de 20/10/2026) |
| Banco | MySQL 8.0+ ou MariaDB 10.6+, no mesmo servidor ou em rede privada |
| Processo | Aplicação Node persistente (não serverless), com variáveis de ambiente privadas |
| HTTPS | Certificado válido; a aplicação aplica HSTS em produção |
| E-mail (opcional) | SMTP para o aviso de novas solicitações |

**Hospedagem só de arquivos estáticos não atende.** Ela consegue servir `dist/`, mas sem o back end o formulário não funciona. Nesse caso, a menor adaptação é manter o site estático onde está e publicar apenas este servidor Node num plano que suporte Node.js + MySQL (por exemplo, os planos da Hostinger com Node.js, ou uma VPS), apontando o domínio para ele. Nenhum serviço foi contratado.

## Primeira publicação

```bash
npm ci --omit=dev                 # dependências de produção
SITE_URL=https://bralvex.com npm run build   # gera dist/
cp .env.example .env              # preencher fora do repositório
npm run migrate                   # com DB_MIGRATION_USER/PASSWORD
npm run admin:create -- pessoa@bralvex.com
npm start
```

- `HOST=127.0.0.1` e `TRUST_PROXY=1` quando houver proxy reverso (padrão das hospedagens gerenciadas). Sem `TRUST_PROXY`, o cookie `Secure` não é emitido atrás do proxy e o limite por IP enxerga o IP do proxy.
- Nos painéis de hospedagem que configuram Node.js, use `npm run build` como comando de build e `npm start` (ou `server/index.js`) como entrada. As variáveis do `.env.example` vão no painel, não em arquivos versionados.
- A raiz `/` redireciona com 301 para `/pt/`, e os links antigos com âncora (`/#patrocinar`) continuam funcionando.

## Atualizações

1. `git pull` na branch aprovada.
2. `npm ci --omit=dev && npm run build`
3. **Backup do banco** (abaixo) e depois `npm run migrate`. As migrations só adicionam e nunca são revertidas automaticamente.
4. Reiniciar o processo Node.

## Backups automáticos

Agendar diariamente (cron do servidor ou backup gerenciado da hospedagem):

```bash
mysqldump --single-transaction --routines --no-tablespaces \
  -h 127.0.0.1 -u bralvex_backup -p"$BACKUP_DB_PASSWORD" bralvex \
  | gzip > /caminho/privado/backups/bralvex-$(date -u +%F).sql.gz
find /caminho/privado/backups -name 'bralvex-*.sql.gz' -mtime +30 -delete
```

- Guardar fora da pasta pública do site, com acesso restrito (`chmod 600`), e copiar para um segundo local (armazenamento externo criptografado).
- A retenção dos backups deve seguir a mesma política definida para os leads (pendência em `docs/PENDENCIAS.md`).

## Restauração

Teste a restauração periodicamente, num banco separado:

```bash
mysql -h 127.0.0.1 -u root -p -e "CREATE DATABASE bralvex_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
gunzip -c bralvex-AAAA-MM-DD.sql.gz | mysql -h 127.0.0.1 -u root -p bralvex_restore
mysql -u root -p bralvex_restore -e "SELECT COUNT(*) FROM leads; SELECT version FROM schema_migrations;"
```

Para restaurar em produção: parar a aplicação, renomear o banco atual (sem apagá-lo), restaurar em `bralvex`, conferir as contagens, aplicar `npm run migrate` e religar a aplicação.

## Segurança operacional

- `.env`, backups e logs ficam fora do repositório (`.gitignore`) e fora da raiz pública.
- Os logs são JSON de uma linha e não registram corpo de requisição, senhas, tokens ou cookies. O IP não é gravado no banco; ele só existe em memória para o limite de requisições.
- Limites atuais: 16 KB por envio do formulário, 5 envios a cada 10 minutos por IP, 15 s por requisição e 8 s por consulta.
- Mensagens públicas de erro são genéricas; os detalhes ficam só no log interno.
- Revise `npm audit` e as versões do Node a cada atualização.
- Os dados do formulário não são enviados a ferramentas de analytics. Se alguma for adicionada ao site, não deve capturar campos nem a URL de `/api`.
