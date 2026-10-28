# Arquitetura, operação e backups

Na Hostinger (plano Premium), siga o passo a passo em [HOSTINGER.md](HOSTINGER.md). Este documento descreve como o sistema funciona e como operar em qualquer hospedagem PHP + MySQL.

## Arquitetura

```
Navegador ──HTTPS──> Apache/LiteSpeed (public_html)
                      ├─ páginas estáticas (/pt, /en, CSS, JS, imagens)  → entregues direto
                      └─ /api/*, /admin/*, páginas do formulário        → app.php (PHP 8.1+)
                                                                            └─ bralvex-app/ (fora da pasta pública)
                                                                                 └─ MySQL/MariaDB em 127.0.0.1
```

- O navegador nunca acessa o banco. Só o PHP conecta, com consultas parametrizadas (PDO, sem emulação).
- **`public_html/.htaccess`:**
  - bloqueia a listagem de pastas, arquivos ocultos e o acesso direto a scripts;
  - força HTTPS e aplica os cabeçalhos de segurança;
  - encaminha as rotas dinâmicas para `app.php`.
- **`bralvex-app/`:** guarda o código, a configuração (`config.php`), as migrations e os logs (`storage/`). Fica fora de `public_html` e ainda tem um `.htaccess` com `Require all denied`, por segurança.
- **`php/dev-router.php`:** reproduz as regras do `.htaccess` no servidor local e nos testes.

## Requisitos da hospedagem

| Recurso | Necessário |
| --- | --- |
| PHP | 8.1 ou superior (recomendado 8.3), com `pdo_mysql`, `mbstring` e `openssl` (padrão na Hostinger) |
| Banco | MySQL 8.0+ ou MariaDB 10.6+ |
| Servidor web | Apache ou LiteSpeed com `.htaccess` (`mod_rewrite` e `mod_headers`) |
| HTTPS | Certificado válido |
| E-mail (opcional) | Caixa com SMTP para o aviso de novas solicitações |

## Banco de dados e migrations

- As migrations ficam em `migrations/NNN_nome.sql`. Elas só adicionam e nunca são revertidas automaticamente.
- Com `AUTO_MIGRATE` ligado (padrão), as pendentes são aplicadas no primeiro acesso a uma rota que usa o banco, com uma trava (`GET_LOCK`) contra execuções simultâneas.
- Em servidores com usuários separados (VPS), `docs/database-setup.sql` cria um usuário da aplicação sem DDL e outro só para as migrations (`DB_MIGRATION_USER`). Na hospedagem compartilhada, o usuário do hPanel cumpre os dois papéis.

## Backups

- **Automáticos:** os da hospedagem (hPanel → Backups).
- **Exportação mensal:** pelo phpMyAdmin, guardada fora do servidor. Em servidor com terminal:

  ```bash
  mysqldump --single-transaction --no-tablespaces -h 127.0.0.1 -u USUARIO -p BANCO | gzip > bralvex-$(date -u +%F).sql.gz
  ```
- **Proteção dos arquivos:** acesso restrito e cópia num segundo local (armazenamento externo criptografado).
- **Retenção:** a dos backups deve acompanhar a política de retenção dos leads.

## Restauração

Teste periodicamente, num banco separado:

1. Crie um banco vazio (ex.: `u123_restore`) no hPanel.
2. Importe o arquivo pelo phpMyAdmin (aba Importar) ou com `gunzip -c arquivo.sql.gz | mysql -u USUARIO -p u123_restore`.
3. Confira as contagens:
   ```sql
   SELECT COUNT(*) FROM leads;
   SELECT version FROM schema_migrations;
   ```

**Para restaurar em produção:**

1. Exporte o estado atual.
2. Restaure no banco do site, ou aponte `DB_NAME` em `config.php` para o banco restaurado.
3. Confira o painel.

As migrations que faltarem são aplicadas sozinhas no próximo acesso.

## Segurança operacional

- **Nada sensível em público:** `config.php`, logs e backups nunca ficam em `public_html` nem no Git (`.gitignore`). A pasta `deploy/`, gerada pelo `npm run hostinger`, contém senhas e deve ser apagada depois do envio.
- **Logs:** ficam em `bralvex-app/storage/app.log`, em JSON de uma linha. Não registram corpo de requisição, senhas, tokens ou cookies.
- **IP do visitante:** não é gravado em lugar nenhum. Os limites de tentativas usam só um HMAC, com expiração.
- **Limites atuais:**
  - 16 KB por envio do formulário;
  - 5 envios a cada 10 minutos por IP;
  - 10 logins a cada 15 minutos por IP;
  - 5 falhas por e-mail.
- **Mensagens de erro:** as públicas são genéricas.
- **Analytics:** os dados do formulário não são enviados a ferramentas de análise. Se alguma for adicionada ao site, não deve capturar campos nem a URL de `/api`.
- **Atualizações:** mantenha o PHP da hospedagem numa versão com suporte (hPanel → Configuração do PHP) e rode `npm audit` antes de gerar pacotes.
