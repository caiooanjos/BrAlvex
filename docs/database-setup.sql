-- Preparação do banco em produção (executar uma vez, como administrador do MySQL/MariaDB).
-- Substitua as senhas por valores fortes gerados na hora; não salve este arquivo com senhas reais.
-- Em hospedagens compartilhadas (ex.: hPanel), crie banco e usuários pelo painel e aplique os privilégios equivalentes.

CREATE DATABASE IF NOT EXISTS bralvex CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Usuário da aplicação: apenas leitura e escrita de dados, sem DDL nem acesso a outros bancos.
CREATE USER IF NOT EXISTS 'bralvex_app'@'127.0.0.1' IDENTIFIED BY 'TROQUE-POR-SENHA-FORTE';
GRANT SELECT, INSERT, UPDATE, DELETE ON bralvex.* TO 'bralvex_app'@'127.0.0.1';

-- Usuário de migrations: usado somente por "npm run migrate" durante a publicação.
CREATE USER IF NOT EXISTS 'bralvex_migrate'@'127.0.0.1' IDENTIFIED BY 'TROQUE-POR-OUTRA-SENHA-FORTE';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP ON bralvex.* TO 'bralvex_migrate'@'127.0.0.1';
-- DROP é necessário apenas se uma futura migration precisar remover objetos; as migrations atuais não removem nada.

-- Usuário de backup (opcional): leitura para mysqldump.
CREATE USER IF NOT EXISTS 'bralvex_backup'@'127.0.0.1' IDENTIFIED BY 'TROQUE-POR-OUTRA-SENHA-FORTE';
GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER ON bralvex.* TO 'bralvex_backup'@'127.0.0.1';

FLUSH PRIVILEGES;
