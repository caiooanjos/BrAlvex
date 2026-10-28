<?php
// Inicialização comum ao site (app.php) e à linha de comando (cli.php): configuração, banco, logs e utilidades.
declare(strict_types=1);

const APP_DIR = __DIR__;

final class ConfigError extends RuntimeException {}

/**
 * Configuração: variáveis de ambiente têm prioridade; em hospedagem compartilhada, os valores vêm de config.php
 * (fora da pasta pública). Os nomes são os mesmos nos dois casos (veja config.example.php).
 */
function config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $file = [];
    $path = getenv('BRALVEX_CONFIG') ?: APP_DIR . '/config.php';
    if (is_file($path)) {
        $file = require $path;
        if (!is_array($file)) {
            throw new ConfigError('config.php deve retornar um array.');
        }
    }
    $get = static function (string $key, ?string $default = null) use ($file): ?string {
        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        $value = $file[$key] ?? null;
        return $value === null || $value === '' ? $default : (string) $value;
    };
    $int = static fn (string $key, int $default): int => is_numeric($get($key)) ? (int) $get($key) : $default;

    $production = $get('APP_ENV', 'production') === 'production';
    $smtpPort = $int('SMTP_PORT', 465);
    $config = [
        'production' => $production,
        'site_url' => rtrim($get('SITE_URL', 'http://localhost:3000'), '/'),
        'db' => [
            'host' => $get('DB_HOST', '127.0.0.1'),
            'port' => $int('DB_PORT', 3306),
            'name' => $get('DB_NAME'),
            'user' => $get('DB_USER'),
            'password' => $get('DB_PASSWORD', ''),
            'migration_user' => $get('DB_MIGRATION_USER'),
            'migration_password' => $get('DB_MIGRATION_PASSWORD', ''),
        ],
        'session_secret' => $get('SESSION_SECRET'),
        'form_token_secret' => $get('FORM_TOKEN_SECRET'),
        'session_idle_minutes' => $int('SESSION_IDLE_MINUTES', 30),
        'session_absolute_hours' => $int('SESSION_ABSOLUTE_HOURS', 8),
        'form_token_min_seconds' => $int('FORM_TOKEN_MIN_SECONDS', 3),
        'form_token_max_hours' => $int('FORM_TOKEN_MAX_HOURS', 48),
        'lead_rate' => ['window' => $int('LEAD_RATE_WINDOW_MINUTES', 10), 'max' => $int('LEAD_RATE_MAX', 5)],
        'login_rate' => ['window' => $int('LOGIN_RATE_WINDOW_MINUTES', 15), 'max' => $int('LOGIN_RATE_MAX', 10)],
        'retention_days' => $get('LEAD_RETENTION_DAYS') ? $int('LEAD_RETENTION_DAYS', 0) : null,
        'smtp' => $get('SMTP_HOST') ? [
            'host' => $get('SMTP_HOST'),
            'port' => $smtpPort,
            'secure' => $get('SMTP_SECURE') !== null ? $get('SMTP_SECURE') === 'true' : $smtpPort === 465,
            'user' => $get('SMTP_USER'),
            'password' => $get('SMTP_PASSWORD', ''),
        ] : null,
        'notify_from' => $get('NOTIFY_FROM', $get('SMTP_USER')),
        'notify_to' => $get('NOTIFY_TO', 'contact@bralvex.com'),
        'admin_timezone' => $get('ADMIN_TIMEZONE', 'America/Sao_Paulo'),
        'auto_migrate' => $get('AUTO_MIGRATE', 'true') !== 'false',
        'admin_seed' => $get('ADMIN_SEED_EMAIL') && $get('ADMIN_SEED_PASSWORD_HASH')
            ? ['email' => strtolower(trim($get('ADMIN_SEED_EMAIL'))), 'hash' => $get('ADMIN_SEED_PASSWORD_HASH')]
            : null,
        // Cabeçalho com o IP real do visitante, apenas se houver proxy confiável que o defina (ex.: HTTP_CF_CONNECTING_IP).
        'client_ip_header' => $get('CLIENT_IP_HEADER'),
        'storage_dir' => $get('STORAGE_DIR', APP_DIR . '/storage'),
    ];

    $missing = array_filter(
        ['DB_NAME', 'DB_USER', 'SESSION_SECRET', 'FORM_TOKEN_SECRET'],
        static fn (string $key): bool => $get($key) === null,
    );
    if ($missing) {
        throw new ConfigError('Configuração ausente: ' . implode(', ', $missing));
    }
    foreach (['SESSION_SECRET', 'FORM_TOKEN_SECRET'] as $key) {
        if (strlen($get($key)) < 32) {
            throw new ConfigError("$key deve ter pelo menos 32 caracteres aleatórios.");
        }
    }
    if ($get('SESSION_SECRET') === $get('FORM_TOKEN_SECRET')) {
        throw new ConfigError('SESSION_SECRET e FORM_TOKEN_SECRET devem ser diferentes.');
    }
    if ($production && !str_starts_with($config['site_url'], 'https://')) {
        throw new ConfigError('Em produção, SITE_URL deve usar https://.');
    }
    return $config;
}

function setup_runtime(): void
{
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    date_default_timezone_set('UTC');
    mb_internal_encoding('UTF-8');
    // Logs ficam na pasta privada (nunca em public_html, onde poderiam ser baixados).
    $dir = getenv('STORAGE_DIR') ?: APP_DIR . '/storage';
    if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) {
        if (!is_file($dir . '/.htaccess')) {
            @file_put_contents($dir . '/.htaccess', "Require all denied\n");
        }
        ini_set('error_log', $dir . '/app.log');
    }
}

/** Log JSON de uma linha. Nunca recebe corpo de requisição, senhas, tokens ou cookies. */
function log_event(string $level, string $event, array $data = []): void
{
    error_log(json_encode(['time' => gmdate('c'), 'level' => $level, 'event' => $event] + $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

function pdo_connect(string $user, string $password): PDO
{
    $c = config()['db'];
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'], $c['name']);
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function db(): PDO
{
    static $pdo = null;
    return $pdo ??= pdo_connect(config()['db']['user'], config()['db']['password']);
}

/** Consulta parametrizada; inteiros e nulos são enviados com o tipo correto (necessário em LIMIT/OFFSET). */
function q(string $sql, array $params = [], ?PDO $pdo = null): PDOStatement
{
    $stmt = ($pdo ?? db())->prepare($sql);
    $i = 1;
    foreach ($params as $value) {
        $type = match (true) {
            is_int($value), is_bool($value) => PDO::PARAM_INT,
            $value === null => PDO::PARAM_NULL,
            default => PDO::PARAM_STR,
        };
        $stmt->bindValue($i++, is_bool($value) ? (int) $value : $value, $type);
    }
    $stmt->execute();
    return $stmt;
}

function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function b64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function uuid4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

/** DATETIME(3) do banco (UTC) em milissegundos. */
function db_time_ms(?string $value): ?int
{
    if (!$value) {
        return null;
    }
    $d = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s.v', $value, new DateTimeZone('UTC'))
        ?: DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, new DateTimeZone('UTC'));
    return $d ? (int) $d->format('Uv') : null;
}

function generated(string $file): string
{
    $path = APP_DIR . '/generated/' . $file;
    if (!is_file($path)) {
        throw new RuntimeException("Arquivo gerado ausente: $file (rode npm run build).");
    }
    return $path;
}

function schema(): array
{
    static $schema = null;
    return $schema ??= json_decode(file_get_contents(generated('schema.json')), true, 64, JSON_THROW_ON_ERROR);
}

function content(?string $lang = null): array
{
    static $content = null;
    $content ??= json_decode(file_get_contents(generated('content.json')), true, 64, JSON_THROW_ON_ERROR);
    return $lang === null ? $content : $content[$lang === 'en' ? 'en' : 'pt'];
}

function password_algo(): string|int
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
}

function migrations_dir(): string
{
    foreach ([APP_DIR . '/migrations', dirname(APP_DIR, 2) . '/migrations'] as $dir) {
        if (is_dir($dir)) {
            return $dir;
        }
    }
    throw new RuntimeException('Pasta de migrations não encontrada.');
}

function migration_files(): array
{
    $files = array_values(array_filter(scandir(migrations_dir()), static fn ($f) => (bool) preg_match('/^\d{3}_[\w-]+\.sql$/', $f)));
    sort($files);
    return $files;
}

/**
 * Aplica migrations pendentes. Usa DB_MIGRATION_USER quando definido; na hospedagem compartilhada,
 * o usuário do banco é o mesmo. Nunca apaga nem reverte nada.
 */
function run_migrations(?callable $log = null): array
{
    $c = config()['db'];
    $pdo = $c['migration_user'] ? pdo_connect($c['migration_user'], (string) $c['migration_password']) : db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL PRIMARY KEY,
        applied_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $lock = (int) q("SELECT GET_LOCK('bralvex_migrate', 30) AS ok", [], $pdo)->fetch()['ok'];
    if ($lock !== 1) {
        throw new RuntimeException('Não foi possível obter a trava de migração.');
    }
    try {
        $applied = array_column(q('SELECT version FROM schema_migrations', [], $pdo)->fetchAll(), 'version');
        $pending = array_values(array_diff(migration_files(), $applied));
        foreach ($pending as $file) {
            $sql = file_get_contents(migrations_dir() . '/' . $file);
            // DDL no MySQL não é transacional: cada comando roda em sequência e a versão só é registrada no fim.
            foreach (split_sql($sql) as $statement) {
                $pdo->exec($statement);
            }
            q('INSERT INTO schema_migrations (version, applied_at) VALUES (?, UTC_TIMESTAMP(3))', [$file], $pdo);
            $log && $log("migration aplicada: $file");
        }
        return $pending;
    } finally {
        q("SELECT RELEASE_LOCK('bralvex_migrate')", [], $pdo);
    }
}

function split_sql(string $sql): array
{
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    return array_values(array_filter(array_map('trim', explode(';', $sql)), static fn ($s) => $s !== ''));
}

/**
 * Garante o banco pronto antes de rotas que o usam: migrations pendentes (se AUTO_MIGRATE) e o administrador
 * inicial definido em config.php. Um marcador na pasta privada evita repetir a verificação a cada acesso.
 */
function ensure_ready(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $c = config();
    $files = migration_files();
    $seedId = $c['admin_seed'] ? hash('sha256', $c['admin_seed']['email'] . '|' . $c['admin_seed']['hash']) : '';
    $stamp = end($files) . '|' . $seedId;
    $marker = $c['storage_dir'] . '/ready.txt';
    if (is_file($marker) && trim((string) file_get_contents($marker)) === $stamp) {
        $done = true;
        return;
    }
    if ($c['auto_migrate']) {
        try {
            $applied = array_column(q('SELECT version FROM schema_migrations')->fetchAll(), 'version');
        } catch (PDOException $e) {
            $applied = [];
        }
        if (array_diff($files, $applied)) {
            run_migrations(static fn ($m) => log_event('info', 'migration.applied', ['message' => $m]));
        }
    }
    if ($c['admin_seed']) {
        apply_admin_seed($c['admin_seed'], $seedId);
    }
    if (is_dir($c['storage_dir']) && is_writable($c['storage_dir'])) {
        @file_put_contents($marker, $stamp);
    }
    $done = true;
}

/** Cria ou redefine o administrador indicado em config.php, uma única vez por combinação e-mail + hash. */
function apply_admin_seed(array $seed, string $seedId): void
{
    $current = q("SELECT value FROM app_state WHERE name = 'admin_seed'")->fetch();
    if ($current && hash_equals($current['value'], $seedId)) {
        return;
    }
    $admin = q('SELECT id FROM admins WHERE email = ?', [$seed['email']])->fetch();
    if ($admin) {
        q('UPDATE admins SET password_hash = ?, is_active = 1, password_changed_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [$seed['hash'], $admin['id']]);
        q('DELETE FROM admin_sessions WHERE admin_id = ?', [$admin['id']]);
        $id = (int) $admin['id'];
    } else {
        q('INSERT INTO admins (email, password_hash, is_active, password_changed_at, created_at, updated_at) VALUES (?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))', [$seed['email'], $seed['hash']]);
        $id = (int) db()->lastInsertId();
    }
    q("INSERT INTO admin_audit_log (admin_id, action, created_at) VALUES (?, 'admin_seed_applied', UTC_TIMESTAMP(3))", [$id]);
    q("INSERT INTO app_state (name, value, updated_at) VALUES ('admin_seed', ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)", [$seedId]);
    log_event('info', 'admin.seed_applied');
}
