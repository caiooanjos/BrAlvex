# Painel administrativo (`/admin/leads`)

O painel não tem cadastro público nem senha padrão. Contas são gerenciadas apenas por linha de comando, no servidor, por quem tem acesso às variáveis de ambiente.

## Criar o primeiro administrador

```bash
npm run admin:create -- pessoa@bralvex.com
```

A senha (mínimo de 12 caracteres) é digitada sem eco e confirmada. Ela não aparece no histórico do shell. Em automação sem terminal, a senha é lida da primeira linha da entrada padrão:

```bash
printf '%s\n' "$SENHA_GERADA" | npm run admin:create -- pessoa@bralvex.com
```

As senhas são armazenadas com hash Argon2id (`@node-rs/argon2`), nunca em texto puro.

## Redefinir senha

Procedimento seguro, sem envio de link por e-mail (ainda não há serviço de envio configurado):

1. A pessoa solicita a redefinição a outra pessoa responsável, por um canal já verificado.
2. Quem tem acesso ao servidor executa:
   ```bash
   npm run admin:reset-password -- pessoa@bralvex.com
   ```
3. A nova senha é entregue por canal seguro (ex.: gerenciador de senhas compartilhado), e a pessoa a troca na sequência pelo mesmo comando.

A redefinição encerra imediatamente todas as sessões abertas daquela conta.

## Desativar uma conta

```bash
npm run admin:deactivate -- pessoa@bralvex.com
```

## Sessões e proteções

- Cookie `HttpOnly`, `SameSite=Strict`, restrito a `/admin` e `Secure` em produção (`__Secure-bralvex_admin`).
- A sessão expira após 30 minutos sem uso (`SESSION_IDLE_MINUTES`) e, em qualquer caso, após 8 horas (`SESSION_ABSOLUTE_HOURS`).
- As sessões ficam no MySQL, e a tabela guarda apenas o hash SHA-256 do identificador.
- O login tem limite por IP (`LOGIN_RATE_*`) e por e-mail (5 falhas em 15 minutos), e mostra a mesma mensagem para e-mail inexistente ou senha errada.
- Toda ação de escrita exige token CSRF e origem própria. Todas as rotas, inclusive a exportação CSV, verificam a sessão no servidor.
- Ficam registradas em `admin_audit_log`: login, logout, visualização, alteração (somente os nomes dos campos alterados), exportação (número de linhas) e exclusão. As respostas do formulário não são copiadas para o log.
- O painel responde com `X-Robots-Tag: noindex` e fica fora do sitemap. Isso não substitui a autenticação.

## MFA (autenticação multifator)

Não foi implementado um MFA próprio. Opções consolidadas, em ordem de menor esforço:

1. **Cloudflare Access (Zero Trust)** na frente de `/admin/*`, com MFA do provedor de identidade (Google Workspace, Microsoft etc.). Não exige mudança de código, mas requer que o domínio esteja numa conta Cloudflare controlada pela BrAlveX.
2. Migrar a autenticação para uma biblioteca com TOTP/WebAuthn mantida pela comunidade (ex.: Better Auth com o plugin `twoFactor`), reaproveitando o MySQL.

## Exportação CSV

`/admin/leads/export.csv` respeita os filtros da tela e exporta no máximo 10.000 linhas. Células que começam com `=`, `+`, `-`, `@`, tabulação ou retorno recebem um apóstrofo, para impedir a execução de fórmulas em planilhas. Por isso, números de WhatsApp aparecem como `'+55…`.
