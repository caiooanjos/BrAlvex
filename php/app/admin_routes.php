<?php
// Rotas do painel /admin. Toda rota (inclusive o CSV) verifica a sessão no servidor.
declare(strict_types=1);

const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos.';
const TOO_MANY_LOGINS = 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.';
const LEAD_ID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D';
const EMAIL_FAILURES_MAX = 5;

function admin_deny(string $method): void
{
    if ($method === 'GET') {
        redirect(302, '/admin/login');
        return;
    }
    html_response(401, message_page('Sessão expirada', 'Entre novamente para continuar.'));
}

/** Contexto do administrador autenticado, ou null (já respondido com redirecionamento ou 401). */
function require_admin(string $method): ?array
{
    $s = session_load();
    if (!$s || empty($s['data']['adminId'])) {
        admin_deny($method);
        return null;
    }
    $authAt = (int) ($s['data']['authAt'] ?? 0);
    if (!$authAt || now_ms() - $authAt > config()['session_absolute_hours'] * 3600 * 1000) {
        session_destroy_current($s);
        admin_deny($method);
        return null;
    }
    $admin = q('SELECT id, email, is_active, password_changed_at FROM admins WHERE id = ?', [(int) $s['data']['adminId']])->fetch();
    // Senha redefinida depois do login invalida a sessão.
    if (!$admin || !$admin['is_active'] || db_time_ms($admin['password_changed_at']) > $authAt) {
        session_destroy_current($s);
        admin_deny($method);
        return null;
    }
    session_touch($s);
    return ['admin' => $admin, 'session' => $s, 'csrf' => (string) $s['data']['csrf']];
}

function admin_router(string $method, string $path): void
{
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store');

    if ($path === '/admin/assets/admin.css' && $method === 'GET') {
        header('Content-Type: text/css; charset=utf-8');
        header('Cache-Control: public, max-age=3600');
        readfile(APP_DIR . '/admin.css');
        return;
    }
    if ($path === '/admin' || $path === '/admin/') {
        redirect(302, '/admin/leads');
        return;
    }
    if ($method === 'POST' && !same_origin_ok()) {
        html_response(403, message_page('Ação recusada', 'Origem da requisição não permitida.'));
        return;
    }
    if ($method === 'POST' && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) {
        html_response(413, message_page('Ação recusada', 'Conteúdo grande demais.'));
        return;
    }

    ensure_ready();
    if (random_int(1, 50) === 1) {
        session_prune();
    }

    if ($path === '/admin/login') {
        if ($method === 'GET') {
            $s = session_load();
            if ($s && !empty($s['data']['adminId'])) {
                redirect(302, '/admin/leads');
                return;
            }
            html_response(200, login_page());
            return;
        }
        if ($method === 'POST') {
            admin_login();
            return;
        }
    }

    if ($path === '/admin/logout' && $method === 'POST') {
        $ctx = require_admin($method);
        if (!$ctx || !admin_csrf($ctx)) {
            return;
        }
        audit((int) $ctx['admin']['id'], 'logout');
        session_destroy_current($ctx['session']);
        redirect(303, '/admin/login');
        return;
    }

    if ($path === '/admin/leads' && $method === 'GET') {
        $ctx = require_admin($method);
        if (!$ctx) {
            return;
        }
        $filters = parse_filters($_GET);
        $flash = ($_GET['deleted'] ?? '') === '1' ? 'Solicitação excluída.' : null;
        html_response(200, list_page($ctx, $filters, list_leads($filters), $flash));
        return;
    }

    if ($path === '/admin/leads/export.csv' && $method === 'GET') {
        $ctx = require_admin($method);
        if ($ctx) {
            export_csv($ctx);
        }
        return;
    }

    if (preg_match('#^/admin/leads/([^/]+)(/delete)?$#D', $path, $m)) {
        $ctx = require_admin($method);
        if (!$ctx) {
            return;
        }
        if ($method === 'POST' && !admin_csrf($ctx)) {
            return;
        }
        $id = strtolower($m[1]);
        $lead = preg_match(LEAD_ID_RE, $id) ? get_lead($id) : null;
        if (!$lead) {
            html_response(404, message_page('Não encontrada', 'Solicitação não encontrada.', $ctx));
            return;
        }
        $delete = isset($m[2]) && $m[2] !== '';
        if ($delete) {
            $method === 'POST' ? admin_delete($ctx, $lead) : html_response(200, delete_page($ctx, $lead));
            return;
        }
        if ($method === 'POST') {
            admin_update($ctx, $lead);
            return;
        }
        audit((int) $ctx['admin']['id'], 'view_lead', $lead['public_id']);
        html_response(200, detail_page($ctx, $lead, ($_GET['saved'] ?? '') === '1' ? 'Alterações salvas.' : null));
        return;
    }

    html_response(404, message_page('Não encontrada', 'Página não encontrada.'));
}

function admin_csrf(array $ctx): bool
{
    if (csrf_ok($ctx['session'])) {
        return true;
    }
    log_event('info', 'admin.csrf_rejected');
    html_response(403, message_page('Ação recusada', 'O formulário expirou. Recarregue a página e tente novamente.'));
    return false;
}

function admin_login(): void
{
    $c = config();
    if (!rate_hit('login_ip', client_ip(), $c['login_rate']['max'], $c['login_rate']['window'])) {
        html_response(429, login_page(TOO_MANY_LOGINS));
        return;
    }
    $email = mb_substr(mb_strtolower(clean_text($_POST['email'] ?? null)), 0, 254);
    $password = is_string($_POST['password'] ?? null) ? substr($_POST['password'], 0, 1024) : '';
    if (rate_blocked('login_email', $email, EMAIL_FAILURES_MAX, $c['login_rate']['window'])) {
        html_response(429, login_page(TOO_MANY_LOGINS, $email));
        return;
    }
    $admin = $email !== '' ? q('SELECT id, password_hash, is_active FROM admins WHERE email = ?', [$email])->fetch() : false;
    if ($admin && $admin['is_active'] && $password !== '') {
        $ok = password_verify($password, $admin['password_hash']);
    } else {
        // Hash fictício para que e-mails inexistentes levem o mesmo tempo de verificação.
        static $dummy = null;
        $dummy ??= password_hash(random_bytes(16), password_algo());
        password_verify($password ?: 'x', $dummy);
        $ok = false;
    }
    if (!$ok) {
        rate_hit('login_email', $email, PHP_INT_MAX, $c['login_rate']['window']);
        log_event('info', 'admin.login_failed');
        html_response(401, login_page(GENERIC_LOGIN_ERROR, $email));
        return;
    }
    rate_reset('login_email', $email);
    if (password_needs_rehash($admin['password_hash'], password_algo())) {
        q('UPDATE admins SET password_hash = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [password_hash($password, password_algo()), $admin['id']]);
    }
    session_destroy_current(session_load());
    header_remove('Set-Cookie');
    // Identificador sempre novo no login (evita fixação de sessão).
    session_create(['adminId' => (int) $admin['id'], 'authAt' => now_ms(), 'csrf' => b64url(random_bytes(32))]);
    q('UPDATE admins SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [$admin['id']]);
    audit((int) $admin['id'], 'login');
    redirect(303, '/admin/leads');
}

function admin_update(array $ctx, array $lead): void
{
    $status = is_string($_POST['status'] ?? null) ? $_POST['status'] : '';
    $notes = clean_text($_POST['notes'] ?? null, true);
    $lastContact = is_string($_POST['last_contact'] ?? null) ? $_POST['last_contact'] : '';
    $errors = [];
    if (!in_array($status, STATUSES, true)) {
        $errors[] = 'Status inválido.';
    }
    if (mb_strlen($notes) > NOTES_MAX) {
        $errors[] = 'As observações excedem ' . NOTES_MAX . ' caracteres.';
    }
    if ($lastContact !== '' && !valid_date($lastContact)) {
        $errors[] = 'Data do último contato inválida.';
    }
    if ($errors) {
        html_response(422, detail_page($ctx, $lead, null, implode(' ', $errors)));
        return;
    }
    update_lead($lead['public_id'], $status, $notes === '' ? null : $notes, $lastContact === '' ? null : "$lastContact 00:00:00.000");
    // Registra apenas o que mudou, sem copiar o conteúdo das observações.
    $changes = [];
    if ($status !== $lead['status']) {
        $changes[] = "status:{$lead['status']}->$status";
    }
    if (($notes === '' ? null : $notes) !== ($lead['internal_notes'] ?: null)) {
        $changes[] = 'notes';
    }
    if ($lastContact !== iso_date($lead['last_contact_at'])) {
        $changes[] = 'last_contact';
    }
    if ($changes) {
        audit((int) $ctx['admin']['id'], 'update_lead', $lead['public_id'], implode(';', $changes));
    }
    redirect(303, "/admin/leads/{$lead['public_id']}?saved=1");
}

function admin_delete(array $ctx, array $lead): void
{
    if (($_POST['confirm'] ?? '') !== 'yes') {
        html_response(422, delete_page($ctx, $lead));
        return;
    }
    delete_lead($lead['public_id']);
    audit((int) $ctx['admin']['id'], 'delete_lead', $lead['public_id']);
    redirect(303, '/admin/leads?deleted=1');
}

function export_csv(array $ctx): void
{
    $rows = export_leads(parse_filters($_GET));
    $header = [
        'id', 'recebida_em_utc', 'atualizada_em_utc', 'idioma', 'versao_formulario', 'status', 'ultimo_contato',
        'objetivo', 'objetivo_outro', 'empresa', 'setor', 'setor_outro', 'cargo', 'site', 'porte',
        'desafio', 'dados', 'momento', 'nome', 'email', 'pais', 'whatsapp',
        'novidades_email', 'novidades_email_em_utc', 'aviso_privacidade',
        'origem', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'observacoes_internas',
    ];
    $data = array_map(static fn ($r) => [
        $r['public_id'], iso_utc($r['created_at']), iso_utc($r['updated_at']), $r['lang'], $r['form_version'], STATUS_LABELS[$r['status']], iso_date($r['last_contact_at']),
        option_label('objective', $r['objective']), $r['objective_other'], $r['company'], option_label('sector', $r['sector']), $r['sector_other'],
        $r['job_role'], $r['website'], option_label('company_size', $r['company_size']), $r['challenge'],
        option_label('data_availability', $r['data_availability']), option_label('timing', $r['timing']),
        $r['full_name'], $r['email'], $r['country'], $r['whatsapp'], $r['marketing_opt_in'] ? 'sim' : 'não', iso_utc($r['marketing_opt_in_at']),
        $r['privacy_notice_version'], $r['referrer_host'], $r['utm_source'], $r['utm_medium'], $r['utm_campaign'], $r['utm_term'], $r['utm_content'],
        $r['internal_notes'],
    ], $rows);
    audit((int) $ctx['admin']['id'], 'export_csv', null, 'rows=' . count($rows));
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="solicitacoes-bralvex-' . gmdate('Y-m-d') . '.csv"');
    echo to_csv($header, $data);
}
