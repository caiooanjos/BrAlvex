<?php
// Acesso às solicitações de teste, auditoria e CSV.
declare(strict_types=1);

const STATUSES = ['new', 'contacting', 'evaluating', 'approved_for_trial', 'closed'];
const PAGE_SIZE = 25;
const EXPORT_LIMIT = 10000;
const NOTES_MAX = 5000;
const DATE_RE = '/^\d{4}-\d{2}-\d{2}$/D';

function valid_date(string $value): bool
{
    if (!preg_match(DATE_RE, $value)) {
        return false;
    }
    [$y, $m, $d] = array_map('intval', explode('-', $value));
    return checkdate($m, $d, $y);
}

/** Grava a solicitação. Reenvio com a mesma chave (duplo clique, nova tentativa) devolve o registro existente. */
function insert_lead(array $lead, array $meta): array
{
    $publicId = uuid4();
    $attr = $meta['attribution'];
    try {
        q('INSERT INTO leads (
            public_id, submission_key, lang, form_version,
            objective, objective_other, company, sector, sector_other, job_role, website, company_size,
            challenge, data_availability, timing, full_name, email, country, whatsapp,
            privacy_notice_version, privacy_notice_shown_at,
            marketing_opt_in, marketing_opt_in_at, marketing_text_version,
            referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3),
            ?, IF(?, UTC_TIMESTAMP(3), NULL), ?, ?, ?, ?, ?, ?, ?, \'new\', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))', [
            $publicId, $meta['submission_key'], $meta['lang'], $meta['form_version'],
            $lead['objective'], $lead['objective_other'], $lead['company'], $lead['sector'], $lead['sector_other'], $lead['job_role'],
            $lead['website'], $lead['company_size'], $lead['challenge'], $lead['data_availability'], $lead['timing'],
            $lead['full_name'], $lead['email'], $lead['country'], $lead['whatsapp'], $meta['privacy_notice_version'],
            $lead['marketing_opt_in'] ? 1 : 0, $lead['marketing_opt_in'] ? 1 : 0, $lead['marketing_opt_in'] ? $meta['marketing_text_version'] : null,
            $attr['referrer_host'], $attr['utm_source'], $attr['utm_medium'], $attr['utm_campaign'], $attr['utm_term'], $attr['utm_content'],
        ]);
        return ['public_id' => $publicId, 'duplicate' => false];
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? null) === 1062 && str_contains($e->getMessage(), 'submission_key')) {
            $row = q('SELECT public_id FROM leads WHERE submission_key = ?', [$meta['submission_key']])->fetch();
            if ($row) {
                return ['public_id' => $row['public_id'], 'duplicate' => true];
            }
        }
        throw $e;
    }
}

/** Normaliza filtros vindos da query string; valores fora do aceito são ignorados. */
function parse_filters(array $query): array
{
    $str = static fn ($key) => is_string($query[$key] ?? null) ? trim($query[$key]) : '';
    $f = [
        'q' => mb_substr($str('q'), 0, 100),
        'status' => in_array($str('status'), STATUSES, true) ? $str('status') : '',
        'lang' => in_array($str('lang'), ['pt', 'en'], true) ? $str('lang') : '',
        'objective' => in_array($str('objective'), schema()['OPTIONS']['objective'], true) ? $str('objective') : '',
        'from' => valid_date($str('from')) ? $str('from') : '',
        'to' => valid_date($str('to')) ? $str('to') : '',
    ];
    $page = ctype_digit($str('page')) ? (int) $str('page') : 1;
    $f['page'] = $page > 0 && $page < 100000 ? $page : 1;
    return $f;
}

function filters_where(array $f): array
{
    $clauses = [];
    $params = [];
    if ($f['q'] !== '') {
        $like = '%' . addcslashes($f['q'], '\\%_') . '%';
        $clauses[] = '(full_name LIKE ? OR company LIKE ? OR email LIKE ?)';
        array_push($params, $like, $like, $like);
    }
    foreach (['status', 'lang', 'objective'] as $key) {
        if ($f[$key] !== '') {
            $clauses[] = "$key = ?";
            $params[] = $f[$key];
        }
    }
    if ($f['from'] !== '') {
        $clauses[] = 'created_at >= ?';
        $params[] = $f['from'] . ' 00:00:00.000';
    }
    if ($f['to'] !== '') {
        $clauses[] = 'created_at < DATE_ADD(?, INTERVAL 1 DAY)';
        $params[] = $f['to'] . ' 00:00:00.000';
    }
    return [$clauses ? 'WHERE ' . implode(' AND ', $clauses) : '', $params];
}

function list_leads(array $f): array
{
    [$where, $params] = filters_where($f);
    $total = (int) q("SELECT COUNT(*) AS total FROM leads $where", $params)->fetch()['total'];
    $rows = q("SELECT public_id, created_at, lang, objective, company, full_name, email, country, status, last_contact_at
               FROM leads $where ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", [...$params, PAGE_SIZE, ($f['page'] - 1) * PAGE_SIZE])->fetchAll();
    return ['total' => $total, 'rows' => $rows, 'pages' => max(1, (int) ceil($total / PAGE_SIZE))];
}

function export_leads(array $f): array
{
    [$where, $params] = filters_where($f);
    return q("SELECT public_id, created_at, updated_at, lang, form_version, status, last_contact_at,
                     objective, objective_other, company, sector, sector_other, job_role, website, company_size,
                     challenge, data_availability, timing, full_name, email, country, whatsapp,
                     marketing_opt_in, marketing_opt_in_at, privacy_notice_version,
                     referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content, internal_notes
              FROM leads $where ORDER BY created_at DESC, id DESC LIMIT ?", [...$params, EXPORT_LIMIT])->fetchAll();
}

function get_lead(string $publicId): ?array
{
    return q('SELECT * FROM leads WHERE public_id = ?', [$publicId])->fetch() ?: null;
}

function update_lead(string $publicId, string $status, ?string $notes, ?string $lastContactAt): void
{
    q('UPDATE leads SET status = ?, internal_notes = ?, last_contact_at = ?, updated_at = UTC_TIMESTAMP(3) WHERE public_id = ?',
        [$status, $notes, $lastContactAt, $publicId]);
}

function delete_lead(string $publicId): void
{
    q('DELETE FROM leads WHERE public_id = ?', [$publicId]);
}

/** Registro mínimo de ações administrativas. Nunca recebe o conteúdo das respostas ou das observações. */
function audit(?int $adminId, string $action, ?string $leadId = null, ?string $meta = null): void
{
    q('INSERT INTO admin_audit_log (admin_id, action, lead_public_id, meta, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
        [$adminId, $action, $leadId, $meta === null ? null : mb_substr($meta, 0, 255)]);
}

/** Célula CSV com prevenção de injeção de fórmulas (planilhas executam células iniciadas por = + - @). */
function csv_cell(mixed $value): string
{
    if ($value === null) {
        return '';
    }
    $text = (string) $value;
    if (preg_match('/^[=+\-@\t\r＝＋－＠]/u', preg_replace('/^\s+/u', '', $text))) {
        $text = "'" . $text;
    }
    return '"' . str_replace('"', '""', $text) . '"';
}

function to_csv(array $header, array $rows): string
{
    $lines = [implode(',', array_map('csv_cell', $header))];
    foreach ($rows as $row) {
        $lines[] = implode(',', array_map('csv_cell', $row));
    }
    // BOM para que o Excel reconheça UTF-8.
    return "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n";
}
