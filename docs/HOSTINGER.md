# Instalação na Hostinger

Passo a passo para publicar o site, o formulário e o painel em `bralvex.com`, usando o recurso **Node.js web app** do hPanel.

## 0. O que precisa existir antes

- **Plano com Node.js:** Business Web Hosting ou Cloud (Startup, Professional, Enterprise ou Enterprise Plus). Os planos Single e Premium **não** rodam Node.js. Confira em hPanel → Websites → Add Website: a opção **Node.js web app** precisa aparecer.
- Acesso ao painel da **Locaweb**, onde está o DNS de `bralvex.com`.
- O código no GitHub (`caiooanjos/BrAlvex`), com a branch `feat/bilingue-solicitacao-teste` aprovada e mesclada na `main`. Também é possível enviar um `.zip` (passo 3).

## 1. Gerar os segredos

No seu computador, rode duas vezes e guarde os resultados num gerenciador de senhas:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

O primeiro resultado é o `SESSION_SECRET` e o segundo, o `FORM_TOKEN_SECRET`. Eles precisam ser diferentes.

## 2. Criar o banco de dados

1. hPanel → **Websites** → **Gerenciar** (no site bralvex.com) → **Bancos de dados** → **Gerenciamento**.
2. Preencha:
   - Nome do banco: `bralvex`
   - Usuário: `bralvex`
   - Senha: uma senha forte nova
3. Clique em **Criar**. A Hostinger adiciona um prefixo aos nomes, por exemplo `u123456789_bralvex`. Anote os nomes completos.

O usuário criado pelo hPanel tem permissão total sobre esse banco. A separação entre usuário da aplicação e usuário de migrations (`docs/database-setup.sql`) não está disponível desse jeito na hospedagem compartilhada. Use o mesmo usuário nos dois papéis.

## 3. Criar o app Node.js

1. hPanel → **Websites** → **Add Website** → **Node.js web app**.
2. Origem do código:
   - **GitHub (recomendado):** conecte a conta e escolha o repositório `BrAlvex`, branch `main`. Cada push publica sozinho.
   - **Arquivo .zip:** no seu computador, gere o pacote sem `node_modules` nem `.git`:
     ```bash
     git archive --format=zip -o bralvex-deploy.zip HEAD
     ```
3. Configurações de build:

   | Campo | Valor |
   | --- | --- |
   | Framework preset | Express (ou Other) |
   | Node.js version | **24** |
   | Build command | `npm run build` |
   | Entry file | `server/index.js` |
   | Output directory | deixe vazio |

4. **Variáveis de ambiente** (na mesma tela, ou depois em Settings → Environment variables):

   ```
   NODE_ENV=production
   SITE_URL=https://bralvex.com
   TRUST_PROXY=1
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=u123456789_bralvex
   DB_USER=u123456789_bralvex
   DB_PASSWORD=(senha do passo 2)
   SESSION_SECRET=(segredo 1)
   FORM_TOKEN_SECRET=(segredo 2)
   ```

   - Use `127.0.0.1`, não `localhost`.
   - Não defina `HOST` nem `PORT`; quem controla isso é a Hostinger.
   - O e-mail de aviso (SMTP) vem no passo 7.

5. Clique em **Deploy** e acompanhe em **Deployments**. Se o build passar mas o site não abrir, veja **Runtime logs**. A primeira linha mostra a versão do Node em uso. Se aparecer "Configuração inválida", falta alguma variável.

## 4. Criar as tabelas e o primeiro administrador

A hospedagem não oferece terminal para o app. Por isso, os dois comandos rodam **do seu computador**, conectando ao banco da Hostinger por acesso remoto temporário.

1. Descubra o seu IP público (por exemplo, em https://meuip.com.br).
2. hPanel → **Bancos de dados** → **MySQL remoto**: adicione esse IP e selecione o banco `u123456789_bralvex`. Anote o **host remoto** exibido, no formato `srvNNNN.hstgr.io`.
3. Na pasta do projeto, crie o arquivo `.env.hostinger`. Ele é ignorado pelo Git e nunca deve ser enviado.
   ```
   NODE_ENV=production
   SITE_URL=https://bralvex.com
   DB_HOST=srvNNNN.hstgr.io
   DB_PORT=3306
   DB_NAME=u123456789_bralvex
   DB_USER=u123456789_bralvex
   DB_PASSWORD=(senha do passo 2)
   SESSION_SECRET=(segredo 1)
   FORM_TOKEN_SECRET=(segredo 2)
   ```
4. Rode:
   ```bash
   node --env-file=.env.hostinger server/migrate.js
   node --env-file=.env.hostinger server/cli/admin.js create seu.email@bralvex.com
   ```
   O segundo comando pede a senha do painel: mínimo de 12 caracteres, digitada sem aparecer na tela.
5. **Remova o seu IP** do MySQL remoto e apague o `.env.hostinger`.

Repita esses passos sempre que uma atualização trouxer uma migration nova (arquivo novo em `migrations/`) ou quando precisar criar ou redefinir um administrador (`reset-password`, `deactivate`).

## 5. Apontar o domínio (DNS na Locaweb)

Hoje `bralvex.com` já aponta para a Hostinger (CDN, IP `103.169.142.0`) e responde 404. Isso indica que já existe um site vazio cadastrado para esse domínio no hPanel.

- Se, ao criar o app no passo 3, o hPanel não aceitar `bralvex.com` por já estar em uso, **remova primeiro o site vazio** (confira antes se não há nada nele) e crie o app de novo.
- Com o app criado em `bralvex.com`, teste o endereço. Se ele já abrir o site, o DNS está certo e você pode pular para o passo 6.

Caso contrário:

1. No hPanel, abra o app e vá em **Domínio**. Anote o **IP** (registro A) indicado.
2. No painel de DNS da Locaweb:
   - `@` (bralvex.com): registro **A** com o IP indicado, substituindo o atual (`103.169.142.0`).
   - `www`: **CNAME** para `bralvex.com`, ou registro A com o mesmo IP.
   - **Não altere os registros MX.** Eles já apontam para o e-mail da Hostinger.
3. A propagação leva de minutos a algumas horas. Depois disso, o hPanel instala o **SSL gratuito** sozinho. Confira em Websites → Segurança → SSL.

## 6. Testar em produção

- `https://bralvex.com` deve abrir `/pt/`, e o seletor deve levar a `/en/`.
- Envie uma solicitação de teste pelo formulário e confira se ela aparece em `https://bralvex.com/admin/leads`.
- Pastas como `https://bralvex.com/server/` ou `https://bralvex.com/assets/` devem responder "Página não encontrada".

## 7. E-mail `contact@bralvex.com` e aviso de novos leads

1. hPanel → **E-mails** → crie a caixa `contact@bralvex.com`, se ainda não existir.
2. Adicione ao app as variáveis abaixo e clique em **Redeploy**:
   ```
   SMTP_HOST=smtp.hostinger.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=contact@bralvex.com
   SMTP_PASSWORD=(senha da caixa)
   NOTIFY_FROM=contact@bralvex.com
   NOTIFY_TO=contact@bralvex.com
   ```
3. Envie um teste pelo formulário. A notificação traz apenas o idioma, o objetivo e o link para o painel; as respostas e os dados de contato não vão no e-mail.

Sem esse passo, o site funciona normalmente e os leads aparecem no painel, mas sem aviso por e-mail.

## 8. Backups

- A Hostinger faz backups automáticos do site e do banco (hPanel → **Backups**). A frequência depende do plano.
- Recomendado: uma vez por mês, exporte o banco em hPanel → Bancos de dados → **phpMyAdmin** → Exportar, e guarde o arquivo num local seguro.
- Para restaurar: hPanel → Backups → Banco de dados → escolha a data. Antes, exporte o estado atual.

## Atualizações futuras

- **Pelo GitHub:** faça push na `main` e a Hostinger reconstrói sozinha.
- **Por .zip:** gere o pacote de novo e envie em Deployments.
- **Se houver migration nova**, repita o passo 4 depois do deploy.
