<?php
// Ponto de entrada das rotas dinâmicas (formulário, API e painel). Fica em public_html; o restante do código
// e a configuração ficam fora da pasta pública, em ../bralvex-app (veja docs/HOSTINGER.md).
declare(strict_types=1);

$candidates = array_filter([
    getenv('BRALVEX_APP_DIR') ?: null,
    dirname(__DIR__) . '/bralvex-app',
    __DIR__ . '/bralvex-app',
    dirname(__DIR__) . '/app',
]);
$appDir = null;
foreach ($candidates as $dir) {
    if (is_file($dir . '/bootstrap.php')) {
        $appDir = $dir;
        break;
    }
}
if ($appDir === null) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Erro interno. Tente novamente em instantes.';
    error_log('bralvex: pasta bralvex-app não encontrada');
    exit;
}

require $appDir . '/bootstrap.php';
require $appDir . '/http.php';
require $appDir . '/validation.php';
require $appDir . '/security.php';
require $appDir . '/leads.php';
require $appDir . '/mailer.php';
require $appDir . '/views.php';
require $appDir . '/public_routes.php';
require $appDir . '/admin_routes.php';

setup_runtime();
handle_request(getenv('BRALVEX_PUBLIC_DIR') ?: __DIR__);
