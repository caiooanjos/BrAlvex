# Pendências

O site está pronto para uso no plano Premium da Hostinger. A Política de Privacidade está publicada em versão formal, com contato por e-mail e WhatsApp e sem dados societários. Os itens abaixo são passos de instalação ou melhorias, não bloqueios.

## Instalação (veja `docs/HOSTINGER.md`)

- [ ] Criar o banco no hPanel.
- [ ] Rodar `npm run hostinger`, enviar e extrair os dois pacotes e apagar a pasta `deploy/`.
- [ ] Conferir o PHP (8.2 ou mais novo) e o SSL.
- [ ] Primeiro acesso a `/admin/leads` e um envio de teste pelo formulário.
- [ ] **E-mail:** criar ou confirmar a caixa `contact@bralvex.com` e informar a senha no `npm run hostinger`, para o aviso de novos leads. Sem isso, os leads ficam no painel, mas sem aviso.
- [ ] Conferir os backups automáticos do plano e fazer a primeira exportação pelo phpMyAdmin.

## Opcional / quando a BrAlveX quiser

- [ ] Incluir razão social, CNPJ e endereço na Política de Privacidade (`site/content/pt.js` e `en.js`, seção "Responsável pelo tratamento"). Ao alterar o texto, atualizar `PRIVACY_NOTICE_VERSION` em `shared/form-schema.js`.
- [ ] Revisão jurídica da Política.
- [ ] Definir um prazo fixo de retenção (`LEAD_RETENTION_DAYS` e `php cli.php retention --apply`) e citá-lo na Política.
- [ ] MFA do painel (Cloudflare Access; veja `docs/ADMIN.md`).
- [ ] Fontes Geist: `original-assets/fonts/` está vazio desde o projeto original. O site usa a fonte reserva. Para usar a Geist, adicionar os `.woff2` (licença OFL) nessa pasta.
- [ ] Revisão nativa do texto em inglês.
