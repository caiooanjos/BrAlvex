# Site BrAlveX

Site institucional bilíngue (português e inglês) com formulário de solicitação de teste, gravação em MySQL e painel administrativo.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `site/content/pt.js`, `site/content/en.js` | Todos os textos do site e do formulário, por idioma |
| `site/templates.js`, `site/build.mjs` | Geração das páginas estáticas em `dist/` (`/pt/…`, `/en/…`, sitemap, robots) |
| `src/` | CSS e JS do navegador (`site.css`, `main.js`, `trial-form.js`); `original-assets/` mantém o CSS original |
| `shared/form-schema.js` | Opções e validação do formulário, usadas no navegador e no servidor |
| `server/` | Express: API do formulário, painel `/admin`, sessões, CSV, avisos por e-mail, CLIs |
| `migrations/` | SQL versionado (`npm run migrate`) |
| `test/` | Testes unitários, de build e de integração com MySQL real |
| `docs/` | Publicação, backups, painel e pendências |

## Rotas

- `/pt/`, `/en/`: página inicial (a raiz `/` redireciona para `/pt/` e preserva as âncoras antigas)
- `/pt/solicitar-teste/`, `/en/request-trial/`: formulário em 8 etapas (7 perguntas e revisão)
- `/pt/privacidade/`, `/en/privacy/`: política de privacidade (versão preliminar com pendências)
- `POST /api/leads`, `GET /api/form-token`
- `/admin/leads`: painel (login obrigatório)

## Desenvolvimento

```bash
npm install
npm run dev
```

O `npm run dev` não precisa de `.env` nem de MySQL instalado. Ele:

- gera o site;
- sobe um MySQL temporário, apagado ao encerrar com Ctrl+C;
- mostra os endereços do site e do painel e um login temporário.

Use sempre esse comando para ver o site no computador. O Live Server do VS Code está configurado para abrir `dist/`, mas nele o formulário e o painel não funcionam.

Para rodar com um MySQL próprio, configure o `.env` (a partir do `.env.example`) e use `npm run migrate`, `npm run admin:create -- voce@exemplo.com` e `npm run dev:mysql`.

Os textos ficam em `site/content/*.js`. Depois de editar, reinicie o `npm run dev` ou rode `npm run build`.

## Testes

```bash
npm test
```

Os testes de integração baixam e executam um MySQL real temporário (`mysql-memory-server`, cerca de 45 s na primeira vez) e verificam gravação, validação, limites, painel, sessões, CSRF e CSV.

**Instalação na Hostinger, passo a passo: [docs/HOSTINGER.md](docs/HOSTINGER.md).** Arquitetura, backups e restauração em geral: [docs/DEPLOY.md](docs/DEPLOY.md). Administradores, em [docs/ADMIN.md](docs/ADMIN.md). O que ainda depende da BrAlveX, em [docs/PENDENCIAS.md](docs/PENDENCIAS.md).
