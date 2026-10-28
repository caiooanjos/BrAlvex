# Instalação na Hostinger (plano Premium)

O plano **Premium Web Hosting** roda PHP + MySQL, mas não Node.js. Por isso o site foi preparado assim:

- **Páginas:** HTML estático, entregue direto pelo servidor da Hostinger.
- **Formulário e painel:** PHP, com banco MySQL.
- **Seu computador:** o Node.js serve apenas para gerar os pacotes de publicação.

Nada precisa ser instalado na Hostinger e não é preciso terminal (SSH).

```
domains/bralvex.com/
├── public_html/        ← site público + app.php (vem de public_html.zip)
└── bralvex-app/        ← código PHP, configuração e senhas (vem de bralvex-app.zip)
                          fica FORA da pasta pública: ninguém acessa pela internet
```

## 1. Criar o banco de dados

1. hPanel → **Websites** → **Gerenciar** (bralvex.com) → **Bancos de dados** → **Gerenciamento**.
2. Crie um banco com:
   - nome: `bralvex`
   - usuário: `bralvex`
   - senha: uma senha forte nova
3. Anote os nomes completos. A Hostinger acrescenta um prefixo, por exemplo `u123456789_bralvex`.

Não é preciso criar tabelas: elas são criadas sozinhas no primeiro acesso.

## 2. (Opcional) Criar a caixa de e-mail

hPanel → **E-mails** → crie `contact@bralvex.com`, se ainda não existir. A senha dessa caixa permite que o site avise a equipe a cada nova solicitação. Isso pode ficar para depois.

## 3. Gerar os pacotes no seu computador

Na pasta do projeto, rode:

```bash
npm install
npm run hostinger
```

O comando pergunta:

- o endereço do site (padrão `https://bralvex.com`);
- os dados do banco (passo 1);
- o e-mail e a senha que você vai usar para entrar no painel (mínimo de 12 caracteres);
- a senha da caixa `contact@bralvex.com` (opcional; deixe em branco para pular).

As senhas não aparecem na tela. No fim, ficam prontos em `deploy/`:

- `public_html.zip`
- `bralvex-app.zip`

As chaves de segurança são geradas automaticamente. A senha do painel é guardada só em formato criptografado (hash).

## 4. Enviar pelo Gerenciador de Arquivos

hPanel → **Websites** → **Gerenciar** → **Gerenciador de Arquivos**.

1. Abra `domains/bralvex.com/public_html/`.
2. **Apague o que já estiver lá**, como a página padrão da Hostinger (`default.php`, `index.php` etc.). Confira antes se não há nada que precise ser mantido.
3. Envie `public_html.zip` para essa pasta, clique com o botão direito → **Extrair** (para a própria pasta) e depois apague o `.zip`.
4. Volte um nível, para `domains/bralvex.com/`.
5. Envie `bralvex-app.zip` ali, ao lado de `public_html` e **não dentro dela**. Extraia e apague o `.zip`. Deve surgir a pasta `bralvex-app`.
6. **Apague a pasta `deploy/` do seu computador.** Ela contém as senhas.

Arquivos que começam com ponto (`.htaccess`) podem ficar ocultos no Gerenciador. Eles são enviados mesmo assim.

## 5. Conferir o PHP e o SSL

- hPanel → **Avançado** → **Configuração do PHP**: use **PHP 8.2 ou mais novo** (recomendado 8.3).
- hPanel → **Segurança** → **SSL**: o certificado deve estar ativo para `bralvex.com`. O site força HTTPS sozinho.

## 6. Primeiro acesso e testes

1. Abra `https://bralvex.com/admin/leads`. Nesse primeiro acesso, as tabelas e o seu usuário do painel são criados.
2. Entre com o e-mail e a senha definidos no passo 3.
3. Abra `https://bralvex.com`: deve ir para `/pt/`, e o seletor de idioma deve levar a `/en/`.
4. Envie uma solicitação pelo formulário e confira se ela aparece no painel.
5. Endereços internos devem responder "Página não encontrada", por exemplo:
   - `https://bralvex.com/app.php`
   - `https://bralvex.com/.htaccess`

## Atualizações futuras

1. Rode `npm run hostinger` de novo. Use os mesmos dados de banco; o e-mail e a senha do painel podem ser os mesmos.
2. Substitua os arquivos de `public_html/` pelos do novo `public_html.zip`.
3. **Também substitua `bralvex-app`**: as chaves de segurança são geradas de novo a cada pacote. Isso apenas encerra as sessões abertas no painel.
4. Se houver mudança no banco, ela é aplicada sozinha no primeiro acesso.

## Senha do painel

- **Esqueceu a senha ou quer trocá-la:** gere o pacote de novo com a nova senha e substitua só o arquivo `bralvex-app/config.php`. A nova senha passa a valer no próximo acesso e encerra as sessões abertas.
- **Mais pessoas no painel:** veja [ADMIN.md](ADMIN.md).

## Backups

- A Hostinger faz backups automáticos (hPanel → **Backups**); a frequência depende do plano.
- Recomendado: uma vez por mês, exporte o banco em hPanel → Bancos de dados → **phpMyAdmin** → Exportar, e guarde o arquivo num local seguro.
- Para restaurar: hPanel → Backups → Banco de dados → escolha a data. Antes, exporte o estado atual.

## Se algo der errado

- **"Erro interno" em `/admin` ou no envio do formulário:** confira os dados do banco em `bralvex-app/config.php` e se a pasta `bralvex-app` está ao lado de `public_html`. O registro de erros fica em `bralvex-app/storage/app.log`, sem dados do formulário.
- **Página em branco ou erro 500 em tudo:** confira a versão do PHP (passo 5).
- **E-mail de aviso não chega:** a solicitação continua gravada no painel; no detalhe dela, "Aviso por e-mail" mostra "Falhou" ou "Não enviado". Confira a senha da caixa `contact@bralvex.com` e gere o pacote de novo.
