<?php
// Proteções: token do formulário, origem, limites de tentativas, CSRF e sessões do painel.
declare(strict_types=1);

/* Token do formulário (armadilha de tempo validada no servidor). Registra quando a página foi entregue, sem identificar o visitante. */

function form_token_sign(string $payload): string
{
    return b64url(hash_hmac('sha256', 'form:' . $payload, config()['form_token_secret'], true));
}

function form_token_issue(): string
{
    $payload = now_ms() . '.' . b64url(random_bytes(6));
    return $payload . '.' . form_token_sign($payload);
}

/** Retorna 'ok', 'too_fast', 'expired' ou 'invalid'. */
function form_token_verify(mixed $token): string
{
    if (!is_string($token) || strlen($token) > 200) {
        return 'invalid';
    }
    $parts = explode('.', $token);
    if (count($parts) !== 3 || !ctype_digit($parts[0])) {
        return 'invalid';
    }
    if (!hash_equals(form_token_sign($parts[0] . '.' . $parts[1]), $parts[2])) {
        return 'invalid';
    }
    $age = now_ms() - (int) $parts[0];
    if ($age < config()['form_token_min_seconds'] * 1000) {
        return 'too_fast';
    }
    if ($age > config()['form_token_max_hours'] * 3600 * 1000) {
        return 'expired';
    }
    return 'ok';
}

/* Origem: recusa escrita vinda de outro site (complementa SameSite e o token CSRF). */

function request_scheme(): string
{
    $https = $_SERVER['HTTPS'] ?? '';
    $forwarded = strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '');
    return ($https !== '' && $https !== 'off') || $forwarded === 'https' ? 'https' : 'http';
}

function origin_of(string $url): ?string
{
    $p = parse_url($url);
    if (!$p || !isset($p['scheme'], $p['host'])) {
        return null;
    }
    return strtolower($p['scheme']) . '://' . strtolower($p['host']) . (isset($p['port']) ? ':' . $p['port'] : '');
}

function same_origin_ok(): bool
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $source = $origin !== '' && $origin !== 'null' ? strtolower($origin) : null;
    if ($source === null && $referer !== '') {
        $source = origin_of($referer) ?? 'invalid';
    }
    if ($source === null) {
        return true;
    }
    $own = request_scheme() . '://' . strtolower($_SERVER['HTTP_HOST'] ?? '');
    return $source === origin_of(config()['site_url']) || $source === $own;
}

/* Limites de tentativas no banco. A chave (IP ou e-mail) é guardada só como HMAC e a linha expira. */

function client_ip(): string
{
    $header = config()['client_ip_header'];
    if ($header && !empty($_SERVER[$header])) {
        return trim(explode(',', (string) $_SERVER[$header])[0]);
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function rate_bucket(string $scope, string $key): string
{
    return hash_hmac('sha256', "rate:$scope:$key", config()['form_token_secret']);
}

/** Registra uma tentativa e informa se ainda está dentro do limite. */
function rate_hit(string $scope, string $key, int $max, int $windowMinutes): bool
{
    $bucket = rate_bucket($scope, $key);
    q('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, UTC_TIMESTAMP(3), 1)
       ON DUPLICATE KEY UPDATE
         hits = IF(window_start < UTC_TIMESTAMP(3) - INTERVAL ? MINUTE, 1, hits + 1),
         window_start = IF(window_start < UTC_TIMESTAMP(3) - INTERVAL ? MINUTE, UTC_TIMESTAMP(3), window_start)',
        [$bucket, $windowMinutes, $windowMinutes]);
    $hits = (int) q('SELECT hits FROM rate_limits WHERE bucket = ?', [$bucket])->fetch()['hits'];
    if (random_int(1, 50) === 1) {
        q('DELETE FROM rate_limits WHERE window_start < UTC_TIMESTAMP(3) - INTERVAL 1 DAY');
    }
    return $hits <= $max;
}

function rate_blocked(string $scope, string $key, int $max, int $windowMinutes): bool
{
    $row = q('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start >= UTC_TIMESTAMP(3) - INTERVAL ? MINUTE',
        [rate_bucket($scope, $key), $windowMinutes])->fetch();
    return $row && (int) $row['hits'] >= $max;
}

function rate_reset(string $scope, string $key): void
{
    q('DELETE FROM rate_limits WHERE bucket = ?', [rate_bucket($scope, $key)]);
}

/* Sessões do painel: identificador aleatório no cookie; o banco guarda apenas o SHA-256 dele. */

function session_cookie_name(): string
{
    return config()['production'] ? '__Secure-bralvex_admin' : 'bralvex_admin';
}

function session_set_cookie(string $value, int $maxAge): void
{
    $cookie = sprintf('%s=%s; Path=/admin; Max-Age=%d; HttpOnly; SameSite=Strict', session_cookie_name(), $value, $maxAge);
    if (config()['production']) {
        $cookie .= '; Secure';
    }
    header('Set-Cookie: ' . $cookie, false);
}

function session_idle_seconds(): int
{
    return config()['session_idle_minutes'] * 60;
}

/** Carrega a sessão válida do cookie, ou null. */
function session_load(): ?array
{
    $sid = $_COOKIE[session_cookie_name()] ?? '';
    if (!is_string($sid) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $sid)) {
        return null;
    }
    $hash = hash('sha256', $sid);
    $row = q('SELECT data FROM admin_sessions WHERE sid_hash = ? AND expires_at > UTC_TIMESTAMP(3)', [$hash])->fetch();
    if (!$row) {
        return null;
    }
    $data = json_decode($row['data'], true);
    return is_array($data) ? ['sid' => $sid, 'hash' => $hash, 'data' => $data] : null;
}

/** Cria uma sessão nova (sempre um identificador novo no login). */
function session_create(array $data): array
{
    $sid = b64url(random_bytes(32));
    $hash = hash('sha256', $sid);
    q('INSERT INTO admin_sessions (sid_hash, admin_id, data, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3) + INTERVAL ? SECOND)',
        [$hash, $data['adminId'] ?? null, json_encode($data), session_idle_seconds()]);
    session_set_cookie($sid, session_idle_seconds());
    return ['sid' => $sid, 'hash' => $hash, 'data' => $data];
}

/** Renova a expiração por inatividade (sessão deslizante). */
function session_touch(array $session): void
{
    q('UPDATE admin_sessions SET expires_at = UTC_TIMESTAMP(3) + INTERVAL ? SECOND WHERE sid_hash = ?', [session_idle_seconds(), $session['hash']]);
    session_set_cookie($session['sid'], session_idle_seconds());
}

function session_destroy_current(?array $session): void
{
    if ($session) {
        q('DELETE FROM admin_sessions WHERE sid_hash = ?', [$session['hash']]);
    }
    header_remove('Set-Cookie');
    session_set_cookie('', 0);
}

function session_prune(): void
{
    q('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
}

function csrf_ok(array $session): bool
{
    $expected = $session['data']['csrf'] ?? '';
    $received = $_POST['_csrf'] ?? '';
    return is_string($expected) && $expected !== '' && is_string($received) && hash_equals($expected, $received);
}
