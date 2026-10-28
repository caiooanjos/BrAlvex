<?php
// Modelo de configuração. O arquivo real (config.php, ao lado deste) é gerado por "npm run hostinger"
// e fica fora da pasta pública. Variáveis de ambiente com os mesmos nomes têm prioridade sobre este arquivo.
return [
    'APP_ENV' => 'production',
    // Endereço público do site (https em produção): links do aviso por e-mail e verificação de origem.
    'SITE_URL' => 'https://bralvex.com',

    // MySQL/MariaDB da hospedagem. Use 127.0.0.1 (não "localhost").
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => '3306',
    'DB_NAME' => 'u123456789_bralvex',
    'DB_USER' => 'u123456789_bralvex',
    'DB_PASSWORD' => '',
    // Opcional: usuário separado com privilégios de DDL só para as migrations.
    'DB_MIGRATION_USER' => '',
    'DB_MIGRATION_PASSWORD' => '',
    // Aplica migrations pendentes automaticamente no primeiro acesso depois de uma atualização.
    'AUTO_MIGRATE' => 'true',

    // Segredos aleatórios e diferentes entre si (mínimo 32 caracteres).
    'SESSION_SECRET' => '',
    'FORM_TOKEN_SECRET' => '',

    // Administrador inicial: criado (ou com a senha redefinida) uma única vez para cada novo hash.
    // Gere o hash com: php cli.php hash-password  (ou deixe o "npm run hostinger" gerar).
    'ADMIN_SEED_EMAIL' => '',
    'ADMIN_SEED_PASSWORD_HASH' => '',

    // Sessão do painel: expira após inatividade e, em qualquer caso, após o limite absoluto.
    'SESSION_IDLE_MINUTES' => '30',
    'SESSION_ABSOLUTE_HOURS' => '8',
    'ADMIN_TIMEZONE' => 'America/Sao_Paulo',

    // Proteções do formulário público e do login.
    'FORM_TOKEN_MIN_SECONDS' => '3',
    'FORM_TOKEN_MAX_HOURS' => '48',
    'LEAD_RATE_WINDOW_MINUTES' => '10',
    'LEAD_RATE_MAX' => '5',
    'LOGIN_RATE_WINDOW_MINUTES' => '15',
    'LOGIN_RATE_MAX' => '10',
    // Só defina se houver um proxy confiável que informe o IP real (ex.: 'HTTP_CF_CONNECTING_IP').
    'CLIENT_IP_HEADER' => '',

    // Prazo de retenção (dias). Vazio = sem exclusão automática (php cli.php retention --apply).
    'LEAD_RETENTION_DAYS' => '',

    // Aviso de nova solicitação por e-mail. Sem SMTP_HOST, o aviso não é enviado e o lead fica marcado como "não enviado".
    'SMTP_HOST' => 'smtp.hostinger.com',
    'SMTP_PORT' => '465',
    'SMTP_SECURE' => 'true',
    'SMTP_USER' => 'contact@bralvex.com',
    'SMTP_PASSWORD' => '',
    'NOTIFY_FROM' => 'BrAlveX <contact@bralvex.com>',
    'NOTIFY_TO' => 'contact@bralvex.com',
];
