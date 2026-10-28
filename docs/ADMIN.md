# Painel administrativo (`/admin/leads`)

O painel não tem cadastro público nem senha padrão. As contas são definidas por quem tem acesso aos arquivos do servidor.

## Primeiro administrador e troca de senha (sem terminal)

O `npm run hostinger` grava em `bralvex-app/config.php` o e-mail do administrador inicial e o *hash* da senha (`ADMIN_SEED_EMAIL` e `ADMIN_SEED_PASSWORD_HASH`). No primeiro acesso ao site com essa configuração:

- se o e-mail ainda não existe, a conta é criada;
- se já existe, a senha é redefinida e todas as sessões abertas daquela conta são encerradas.

Isso acontece **uma única vez por senha**. Para trocar a senha ou recuperar o acesso, gere o pacote de novo com a nova senha e substitua apenas o `config.php`. A senha nunca fica gravada em texto puro: só o *hash* (bcrypt, atualizado automaticamente para Argon2id no primeiro login quando o PHP do servidor oferece).

## Linha de comando (SSH ou computador com acesso ao banco)

Na pasta `bralvex-app`:

```bash
php cli.php admin:create pessoa@bralvex.com          # cria outro administrador
php cli.php admin:reset-password pessoa@bralvex.com  # nova senha e encerra as sessões dela
php cli.php admin:deactivate pessoa@bralvex.com      # desativa a conta e encerra as sessões
php cli.php migrate                                  # aplica migrations pendentes (normalmente automático)
php cli.php retention [--apply]                      # aplica LEAD_RETENTION_DAYS (sem --apply, só simula)
```

A senha é digitada sem eco (mínimo de 12 caracteres) e nunca passada como argumento. A redefinição deve ser pedida por um canal já verificado, e a nova senha entregue por canal seguro, como um gerenciador de senhas compartilhado.

## Sessões e proteções

- **Cookie:** `HttpOnly`, `SameSite=Strict` e restrito a `/admin`. Em produção, também `Secure`, com o prefixo `__Secure-`.
- **Expiração:** após 30 minutos sem uso (`SESSION_IDLE_MINUTES`) e, em qualquer caso, após 8 horas (`SESSION_ABSOLUTE_HOURS`).
- **Armazenamento:** as sessões ficam no MySQL, e a tabela guarda apenas o SHA-256 do identificador. Cada login gera um identificador novo.
- **Login:**
  - limite por IP (`LOGIN_RATE_*`) e por e-mail (5 falhas em 15 minutos);
  - a mesma mensagem para e-mail inexistente ou senha errada.

  Os contadores guardam só um HMAC do IP ou do e-mail, nunca o valor original.
- **Escrita:** toda ação de escrita exige token CSRF e origem própria.
- **Verificação no servidor:** todas as rotas, inclusive a exportação CSV, verificam a sessão.
- **Auditoria (`admin_audit_log`):** ficam registrados:
  - login e logout;
  - visualização de uma solicitação;
  - alteração (somente os nomes dos campos alterados);
  - exportação (número de linhas);
  - exclusão;
  - criação ou redefinição de contas.

  As respostas do formulário não são copiadas para o registro.
- **Indexação:** o painel responde com `X-Robots-Tag: noindex` e fica fora do sitemap. Isso não substitui a autenticação.

## MFA (autenticação multifator)

Não há MFA próprio. Opção consolidada, sem mudança de código: **Cloudflare Access (Zero Trust)** na frente de `/admin/*`, com o MFA do provedor de identidade (Google Workspace, Microsoft etc.). Exige que o domínio esteja numa conta Cloudflare controlada pela BrAlveX.

## Exportação CSV

`/admin/leads/export.csv` respeita os filtros da tela e exporta no máximo 10.000 linhas. Células que começam com `=`, `+`, `-`, `@`, tabulação ou retorno recebem um apóstrofo, para impedir a execução de fórmulas em planilhas. Por isso, números de WhatsApp aparecem como `'+55…`.
