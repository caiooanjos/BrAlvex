<?php
// Administração pela linha de comando (SSH da hospedagem ou computador local com acesso ao banco).
//
//   php cli.php migrate                          aplica migrations pendentes
//   php cli.php admin:create email@dominio.com   cria um administrador (senha pedida sem eco)
//   php cli.php admin:reset-password email@...   define nova senha e encerra as sessões dele
//   php cli.php admin:deactivate email@...       desativa a conta e encerra as sessões
//   php cli.php retention [--apply]              aplica LEAD_RETENTION_DAYS (sem --apply, só simula)
//   php cli.php hash-password                    lê uma senha da entrada padrão e imprime o hash (bcrypt)
//
// A senha nunca é passada como argumento (ficaria no histórico do shell). Não existe senha padrão.
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/leads.php';

const MIN_PASSWORD = 12;

function fail(string $message, int $code = 1): never
{
    fwrite(STDERR, "Erro: $message\n");
    exit($code);
}

function read_secret(string $prompt): string
{
    $tty = stream_isatty(STDIN);
    if (!$tty) {
        return rtrim((string) fgets(STDIN), "\r\n");
    }
    fwrite(STDOUT, $prompt);
    $hide = DIRECTORY_SEPARATOR === '/';
    if ($hide) {
        shell_exec('stty -echo');
    }
    $value = rtrim((string) fgets(STDIN), "\r\n");
    if ($hide) {
        shell_exec('stty echo');
    }
    fwrite(STDOUT, "\n");
    return $value;
}

function ask_new_password(): string
{
    $first = read_secret('Nova senha (mínimo ' . MIN_PASSWORD . ' caracteres): ');
    if (mb_strlen($first) < MIN_PASSWORD) {
        fail('A senha deve ter pelo menos ' . MIN_PASSWORD . ' caracteres.');
    }
    if (strlen($first) > 1024) {
        fail('Senha longa demais.');
    }
    if (stream_isatty(STDIN) && read_secret('Repita a senha: ') !== $first) {
        fail('As senhas não conferem.');
    }
    return $first;
}

function admin_email(?string $raw): string
{
    $email = strtolower(trim((string) $raw));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/D', $email)) {
        fail('Informe um e-mail válido.', 2);
    }
    return $email;
}

$command = $argv[1] ?? '';
try {
    if ($command === 'hash-password') {
        $password = rtrim((string) fgets(STDIN), "\r\n");
        if (mb_strlen($password) < MIN_PASSWORD) {
            fail('A senha deve ter pelo menos ' . MIN_PASSWORD . ' caracteres.');
        }
        // bcrypt funciona em qualquer PHP; no primeiro login o hash é atualizado para argon2id, se disponível.
        echo password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]), "\n";
        exit(0);
    }

    config();
    switch ($command) {
        case 'migrate':
            $applied = run_migrations(static fn ($m) => print("$m\n"));
            if (!$applied) {
                echo "Nenhuma migration pendente.\n";
            }
            break;

        case 'admin:create':
            $email = admin_email($argv[2] ?? null);
            if (q('SELECT id FROM admins WHERE email = ?', [$email])->fetch()) {
                fail('Já existe um administrador com esse e-mail. Use admin:reset-password.');
            }
            $hash = password_hash(ask_new_password(), password_algo());
            q('INSERT INTO admins (email, password_hash, is_active, password_changed_at, created_at, updated_at)
               VALUES (?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))', [$email, $hash]);
            audit((int) db()->lastInsertId(), 'admin_created_cli');
            echo "Administrador criado.\n";
            break;

        case 'admin:reset-password':
            $email = admin_email($argv[2] ?? null);
            $admin = q('SELECT id FROM admins WHERE email = ?', [$email])->fetch() ?: fail('Administrador não encontrado.');
            $hash = password_hash(ask_new_password(), password_algo());
            q('UPDATE admins SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [$hash, $admin['id']]);
            q('DELETE FROM admin_sessions WHERE admin_id = ?', [$admin['id']]);
            audit((int) $admin['id'], 'password_reset_cli');
            echo "Senha redefinida. As sessões abertas desse administrador foram encerradas.\n";
            break;

        case 'admin:deactivate':
            $email = admin_email($argv[2] ?? null);
            $admin = q('SELECT id FROM admins WHERE email = ?', [$email])->fetch() ?: fail('Administrador não encontrado.');
            q('UPDATE admins SET is_active = 0, updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [$admin['id']]);
            q('DELETE FROM admin_sessions WHERE admin_id = ?', [$admin['id']]);
            audit((int) $admin['id'], 'admin_deactivated_cli');
            echo "Administrador desativado e sessões encerradas.\n";
            break;

        case 'retention':
            $days = config()['retention_days'];
            if (!$days || $days < 1) {
                fail('LEAD_RETENTION_DAYS não está definido. Defina o prazo de retenção antes de usar este comando.', 2);
            }
            if (!in_array('--apply', $argv, true)) {
                $total = q('SELECT COUNT(*) AS n FROM leads WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL ? DAY', [$days])->fetch()['n'];
                echo "$total solicitação(ões) com mais de $days dias seriam excluídas. Rode com --apply para excluir.\n";
                break;
            }
            $deleted = q('DELETE FROM leads WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL ? DAY', [$days])->rowCount();
            audit(null, 'retention_purge', null, "rows=$deleted;days=$days");
            echo "$deleted solicitação(ões) excluída(s).\n";
            break;

        default:
            fail('Uso: php cli.php <migrate|admin:create|admin:reset-password|admin:deactivate|retention|hash-password> [email]', 2);
    }
} catch (ConfigError $e) {
    fail('Configuração inválida: ' . $e->getMessage());
} catch (PDOException $e) {
    fail('Falha no banco de dados (' . ($e->errorInfo[1] ?? $e->getCode()) . '): ' . $e->getMessage());
}
