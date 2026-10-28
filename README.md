# Site BrAlveX

Site institucional bilíngue (português e inglês) com formulário de solicitação de teste, gravação em MySQL e painel administrativo.

- **Produção:** páginas estáticas mais um back end em **PHP 8.1+ e MySQL**, compatível com o plano Premium da Hostinger.
- **Node.js:** usado só no computador de quem mantém o site, para gerar as páginas, testar e empacotar.

**Para publicar na Hostinger: [docs/HOSTINGER.md](docs/HOSTINGER.md).**

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `site/content/pt.js`, `site/content/en.js` | Todos os textos do site e do formulário, por idioma |
| `site/templates.js`, `site/build.mjs` | Geram as páginas em `dist/` (`/pt/…`, `/en/…`, sitemap, robots, `.htaccess`) e os dados que o PHP usa |
| `site/htaccess` | Regras do servidor web: sem listagem de pastas, HTTPS, bloqueios, cabeçalhos e rotas para `app.php` |
| `src/` | CSS e JS do navegador (`site.css`, `main.js`, `trial-form.js`); `original-assets/` mantém o CSS original |
| `shared/form-schema.js` | Opções e validação do formulário no navegador (o PHP espelha essa validação; um teste compara as duas) |
| `php/public/app.php` | Ponto de entrada das rotas dinâmicas (vai para `public_html`) |
| `php/app/` | Back end PHP: formulário, painel, sessões, CSV, e-mail, migrations e `cli.php` (vai para `bralvex-app`, fora da pasta pública) |
| `migrations/` | SQL versionado, aplicado automaticamente |
| `scripts/` | `npm run dev` (ambiente local), `npm run hostinger` (pacotes de publicação) e utilitários |
| `test/` | Testes de build, de validação (JS × PHP) e de integração com PHP e MySQL reais |
| `docs/` | Publicação, painel, backups e pendências |

## Rotas

- `/pt/`, `/en/`: página inicial (a raiz `/` redireciona para `/pt/` e preserva as âncoras antigas)
- `/pt/solicitar-teste/`, `/en/request-trial/`: formulário em 8 etapas (7 perguntas e revisão)
- `/pt/privacidade/`, `/en/privacy/`: política de privacidade
- `POST /api/leads`, `GET /api/form-token`
- `/admin/leads`: painel (login obrigatório)

## Desenvolvimento

```bash
npm install
npm run dev
```

O `npm run dev` não precisa de configuração. Ele:

- gera o site;
- sobe um MySQL temporário, apagado ao encerrar com Ctrl+C;
- sobe o mesmo back end PHP que roda na Hostinger;
- mostra os endereços e um login temporário do painel.

No Windows, na primeira vez ele baixa um PHP portátil oficial (cerca de 30 MB) para `.cache/php`. Em outros sistemas, use o PHP instalado ou defina `PHP_BINARY`.

Os textos ficam em `site/content/*.js`. Depois de editar, reinicie o `npm run dev`.

## Testes

```bash
npm test
```

Os testes de integração rodam o back end PHP contra um MySQL real temporário (`mysql-memory-server`). Eles verificam:

- gravação, validação, limites e antispam;
- envio e falha do aviso por e-mail;
- painel, sessões, CSRF, CSV e auditoria;
- criação automática das tabelas e do administrador inicial;
- que nenhuma pasta seja listada e nenhum arquivo interno fique exposto.

## Documentação

- [docs/HOSTINGER.md](docs/HOSTINGER.md): instalação e atualização na Hostinger, passo a passo
- [docs/ADMIN.md](docs/ADMIN.md): administradores, senhas e proteções do painel
- [docs/DEPLOY.md](docs/DEPLOY.md): arquitetura, backups, restauração e segurança operacional
- [docs/PENDENCIAS.md](docs/PENDENCIAS.md): o que ainda depende da BrAlveX
