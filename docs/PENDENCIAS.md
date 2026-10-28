# Pendências

O site está pronto para uso. A Política de Privacidade está publicada em versão formal, com contato por e-mail e WhatsApp e sem dados societários. Os itens abaixo são melhorias ou passos de instalação, não bloqueios.

## Instalação (veja `docs/HOSTINGER.md`)

- [ ] Confirmar que o plano da Hostinger é Business ou Cloud (com **Node.js web app**).
- [ ] Criar o banco, o app Node.js e as variáveis de ambiente, com segredos novos.
- [ ] Rodar as migrations e criar o primeiro administrador (acesso remoto temporário ao MySQL).
- [ ] Conferir o domínio e o SSL.
- [ ] **E-mail**: criar ou confirmar a caixa `contact@bralvex.com` e configurar o SMTP para o aviso de novos leads. Sem isso, os leads ficam no painel, mas sem aviso.
- [ ] Conferir os backups automáticos do plano.

## Opcional / quando a BrAlveX quiser

- [ ] Incluir razão social, CNPJ e endereço na Política de Privacidade (`site/content/pt.js` e `en.js`, seção "Responsável pelo tratamento"). Ao alterar o texto, atualizar `PRIVACY_NOTICE_VERSION` em `shared/form-schema.js`.
- [ ] Revisão jurídica da Política.
- [ ] Definir um prazo fixo de retenção. Se definido, preencher `LEAD_RETENTION_DAYS`, executar `npm run retention -- --apply` periodicamente e citar o prazo na Política.
- [ ] MFA do painel (opções em `docs/ADMIN.md`).
- [ ] Fontes Geist: `original-assets/fonts/` está vazio desde o projeto original. O site usa a fonte reserva. Para usar a Geist, adicionar os `.woff2` (licença OFL) nessa pasta.
- [ ] Revisão nativa do texto em inglês.
