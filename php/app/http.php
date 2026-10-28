<?php
// Respostas HTTP e cabeçalhos de segurança.
declare(strict_types=1);

function security_headers(): void
{
    header_remove('X-Powered-By');
    $csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
        . "form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
    $production = false;
    try {
        $production = config()['production'];
    } catch (ConfigError) {
        $production = true;
    }
    if ($production) {
        $csp .= '; upgrade-insecure-requests';
        header('Strict-Transport-Security: max-age=31536000');
    }
    header('Content-Security-Policy: ' . $csp);
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Frame-Options: DENY');
    header('Cross-Origin-Opener-Policy: same-origin');
}

function json_response(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function html_response(int $status, string $html): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo $html;
}

function redirect(int $status, string $location): void
{
    http_response_code($status);
    header('Location: ' . $location);
}

function not_found_page(string $publicDir): void
{
    $page = is_file($publicDir . '/404.html') ? file_get_contents($publicDir . '/404.html') : 'Página não encontrada.';
    html_response(404, $page);
}

/**
 * Atende as rotas dinâmicas (o servidor web entrega os arquivos estáticos e encaminha só estas rotas para app.php).
 * Erros internos ficam no log privado; o público recebe mensagem genérica.
 */
function handle_request(string $publicDir): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    security_headers();
    try {
        config();
        if ($path === '/pt/solicitar-teste/' || $path === '/en/request-trial/') {
            if ($method === 'GET' || $method === 'HEAD') {
                trial_page($publicDir, $path);
                return;
            }
        } elseif ($path === '/api/form-token' && $method === 'GET') {
            form_token_route();
            return;
        } elseif ($path === '/api/leads' && $method === 'POST') {
            submit_lead();
            return;
        } elseif ($path === '/admin' || str_starts_with($path, '/admin/')) {
            admin_router($method, $path);
            return;
        }
        if (str_starts_with($path, '/api/')) {
            json_response(404, ['ok' => false, 'error' => 'not_found']);
            return;
        }
        not_found_page($publicDir);
    } catch (Throwable $e) {
        log_event('error', 'request.failed', [
            'method' => $method,
            'path' => $path,
            'type' => $e::class,
            'code' => $e instanceof PDOException ? ($e->errorInfo[1] ?? $e->getCode()) : $e->getCode(),
            'where' => basename($e->getFile()) . ':' . $e->getLine(),
        ]);
        if (headers_sent()) {
            return;
        }
        header_remove('Set-Cookie');
        if ($path === '/api/leads' && request_content_type() === 'application/x-www-form-urlencoded') {
            nojs_page(($_POST['lang'] ?? '') === 'en' ? 'en' : 'pt', 500, [failure_message(($_POST['lang'] ?? '') === 'en' ? 'en' : 'pt', 'server')]);
            return;
        }
        if (str_starts_with($path, '/api/')) {
            json_response(500, ['ok' => false, 'error' => 'server_error']);
            return;
        }
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Erro interno. Tente novamente em instantes.';
    }
}
