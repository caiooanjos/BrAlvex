<?php
// Roteador do servidor embutido do PHP (somente desenvolvimento e testes).
// Reproduz as regras do .htaccess de produção (site/htaccess): bloqueios, redirecionamentos, arquivos estáticos e rotas dinâmicas.
declare(strict_types=1);

$public = rtrim((string) getenv('BRALVEX_PUBLIC_DIR'), '/\\');
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$query = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_QUERY);

$staticHeaders = static function (): void {
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Frame-Options: DENY');
};
$notFound = static function () use ($public, $staticHeaders): bool {
    $staticHeaders();
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    readfile($public . '/404.html');
    return true;
};

// Arquivos e pastas ocultos, caminhos relativos e tipos sensíveis.
if (str_contains($path, '..') || preg_match('#(^|/)\.(?!well-known(/|$))#', $path) || preg_match('/\.(php|sql|gz|zip|log|md|mjs|ini|sh|lock|env|json)$/i', $path)) {
    return $notFound();
}

$redirects = [
    '/' => '/pt/', '/index.html' => '/pt/', '/pt' => '/pt/', '/en' => '/en/',
    '/solicitar-teste' => '/pt/solicitar-teste/', '/pt/solicitar-teste' => '/pt/solicitar-teste/',
    '/request-trial' => '/en/request-trial/', '/en/request-trial' => '/en/request-trial/',
    '/privacidade' => '/pt/privacidade/', '/privacy' => '/en/privacy/',
];
if (isset($redirects[$path]) && in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    http_response_code(301);
    header('Location: ' . $redirects[$path] . ($query ? "?$query" : ''));
    return true;
}

if (in_array($path, ['/pt/solicitar-teste/', '/en/request-trial/'], true) || str_starts_with($path, '/api/') || $path === '/admin' || str_starts_with($path, '/admin/')) {
    require getenv('BRALVEX_ENTRY') ?: __DIR__ . '/public/app.php';
    return true;
}

$file = $public . $path;
if (is_dir($file)) {
    if (!str_ends_with($path, '/')) {
        http_response_code(301);
        header('Location: ' . $path . '/' . ($query ? "?$query" : ''));
        return true;
    }
    $file .= 'index.html';
}
if (!is_file($file)) {
    return $notFound();
}
$types = [
    'html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
    'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
    'ico' => 'image/x-icon', 'xml' => 'application/xml; charset=utf-8', 'txt' => 'text/plain; charset=utf-8', 'woff2' => 'font/woff2',
];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
$staticHeaders();
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Cache-Control: ' . (in_array($ext, ['html', 'xml'], true) ? 'no-cache' : 'public, max-age=3600'));
readfile($file);
return true;
