<?php
// Telas do painel administrativo. Todo valor dinâmico passa por e().
declare(strict_types=1);

const STATUS_LABELS = [
    'new' => 'Novo',
    'contacting' => 'Em contato',
    'evaluating' => 'Em avaliação',
    'approved_for_trial' => 'Aprovado para teste',
    'closed' => 'Encerrado',
];
const NOTIFICATION_LABELS = [
    'pending' => 'Pendente',
    'sent' => 'Enviado',
    'skipped' => 'Não enviado (envio de e-mail não configurado)',
    'failed' => 'Falhou',
];
const LANG_LABELS = ['pt' => 'Português', 'en' => 'Inglês'];

function option_label(string $field, ?string $value): string
{
    return $value ? (content('pt')['options'][$field][$value] ?? $value) : '—';
}

function field_label(string $field): string
{
    return content('pt')['fields'][$field] ?? $field;
}

function country_label(?string $code): string
{
    $names = content()['countries_pt'];
    return $code && isset($names[$code]) ? "{$names[$code]} ($code)" : ($code ?: '—');
}

function fmt_datetime(?string $value): string
{
    if (!$value) {
        return '—';
    }
    $d = new DateTimeImmutable($value, new DateTimeZone('UTC'));
    return $d->setTimezone(new DateTimeZone(config()['admin_timezone']))->format('d/m/Y, H:i');
}

/** Data do último contato é gravada como data (00:00 UTC). */
function fmt_date(?string $value): string
{
    return $value ? implode('/', array_reverse(explode('-', substr($value, 0, 10)))) : '—';
}

function iso_date(?string $value): string
{
    return $value ? substr($value, 0, 10) : '';
}

function iso_utc(?string $value): ?string
{
    return $value ? (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z') : null;
}

function layout(string $title, string $body, ?array $admin = null, string $csrf = ''): string
{
    $user = $admin
        ? '<div class="adm-user"><span>' . e($admin['email']) . '</span>
          <form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="' . e($csrf) . '" /><button type="submit" class="adm-link">Sair</button></form></div>'
        : '';
    return '<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>' . e($title) . ' | Painel BrAlveX</title>
  <link rel="stylesheet" href="/admin/assets/admin.css" />
</head>
<body>
  <header class="adm-header">
    <a class="adm-brand" href="/admin/leads">BrAlve<span>X</span> <small>Painel</small></a>
    ' . $user . '
  </header>
  <main class="adm-main">' . $body . '</main>
</body>
</html>';
}

function login_page(?string $error = null, string $email = ''): string
{
    return layout('Entrar', '<section class="adm-card adm-login">
      <h1>Entrar no painel</h1>
      ' . ($error ? '<p class="adm-alert" role="alert">' . e($error) . '</p>' : '') . '
      <form method="post" action="/admin/login">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" required maxlength="254" value="' . e($email) . '" />
        <label for="password">Senha</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024" />
        <button type="submit" class="adm-button">Entrar</button>
      </form>
      <p class="adm-muted">Não há cadastro público. Para acesso ou redefinição de senha, siga o procedimento descrito em docs/ADMIN.md.</p>
    </section>');
}

function filter_select(string $name, string $label, array $values, callable $labelOf, string $current): string
{
    $options = '';
    foreach ($values as $v) {
        $options .= '<option value="' . e($v) . '"' . ($v === $current ? ' selected' : '') . '>' . e($labelOf($v)) . '</option>';
    }
    return '<label>' . e($label) . '
    <select name="' . e($name) . '">
      <option value="">Todos</option>' . $options . '
    </select></label>';
}

function filters_query(array $f, array $overrides = []): string
{
    $params = [];
    foreach (['q', 'status', 'lang', 'objective', 'from', 'to'] as $key) {
        if ($f[$key] !== '') {
            $params[$key] = $f[$key];
        }
    }
    $s = http_build_query(array_merge($params, $overrides), '', '&', PHP_QUERY_RFC3986);
    return $s === '' ? '' : '?' . $s;
}

function list_page(array $ctx, array $f, array $result, ?string $flash): string
{
    $total = $result['total'];
    $first = $total ? ($f['page'] - 1) * PAGE_SIZE + 1 : 0;
    $last = min($f['page'] * PAGE_SIZE, $total);
    $rows = '';
    foreach ($result['rows'] as $r) {
        $rows .= '<tr>
              <td><a href="/admin/leads/' . e($r['public_id']) . '">' . e(fmt_datetime($r['created_at'])) . '</a></td>
              <td>' . e($r['full_name']) . '</td><td>' . e($r['company']) . '</td><td>' . e($r['email']) . '</td>
              <td>' . e(option_label('objective', $r['objective'])) . '</td><td>' . e(strtoupper($r['lang'])) . '</td>
              <td><span class="adm-status adm-status--' . e($r['status']) . '">' . e(STATUS_LABELS[$r['status']]) . '</span></td>
            </tr>';
    }
    $table = $rows === '' ? '' : '<div class="adm-table-wrap"><table class="adm-table">
          <thead><tr><th scope="col">Recebida em</th><th scope="col">Nome</th><th scope="col">Empresa</th><th scope="col">E-mail</th><th scope="col">Objetivo</th><th scope="col">Idioma</th><th scope="col">Status</th></tr></thead>
          <tbody>' . $rows . '</tbody></table></div>';
    $pager = '';
    if ($result['pages'] > 1) {
        $prev = $f['page'] > 1 ? '<a href="/admin/leads' . e(filters_query($f, ['page' => $f['page'] - 1])) . '">← Mais recentes</a>' : '<span></span>';
        $next = $f['page'] < $result['pages'] ? '<a href="/admin/leads' . e(filters_query($f, ['page' => $f['page'] + 1])) . '">Mais antigas →</a>' : '<span></span>';
        $pager = '<nav class="adm-pager" aria-label="Paginação">' . $prev . '<span>Página ' . $f['page'] . ' de ' . $result['pages'] . '</span>' . $next . '</nav>';
    }
    $objectives = schema()['OPTIONS']['objective'];
    $body = '
      <div class="adm-title"><h1>Solicitações de teste</h1>
        <a class="adm-button adm-button--ghost" href="/admin/leads/export.csv' . e(filters_query($f)) . '">Exportar CSV</a></div>
      ' . ($flash ? '<p class="adm-flash" role="status">' . e($flash) . '</p>' : '') . '
      <form class="adm-filters" method="get" action="/admin/leads" role="search">
        <label class="adm-filters__q">Buscar (nome, empresa ou e-mail)<input type="search" name="q" value="' . e($f['q']) . '" maxlength="100" /></label>
        ' . filter_select('status', 'Status', STATUSES, static fn ($v) => STATUS_LABELS[$v], $f['status']) . '
        ' . filter_select('lang', 'Idioma', ['pt', 'en'], static fn ($v) => LANG_LABELS[$v], $f['lang']) . '
        ' . filter_select('objective', 'Objetivo', $objectives, static fn ($v) => option_label('objective', $v), $f['objective']) . '
        <label>De<input type="date" name="from" value="' . e($f['from']) . '" /></label>
        <label>Até<input type="date" name="to" value="' . e($f['to']) . '" /></label>
        <div class="adm-filters__actions"><button class="adm-button" type="submit">Filtrar</button><a class="adm-link" href="/admin/leads">Limpar</a></div>
      </form>
      <p class="adm-muted">' . e($total ? "$first–$last de $total" : 'Nenhuma solicitação encontrada.') . ' · Datas em ' . e(config()['admin_timezone']) . '.</p>
      ' . $table . $pager;
    return layout('Solicitações', $body, $ctx['admin'], $ctx['csrf']);
}

function dl_row(string $label, ?string $valueHtml, string $class = ''): string
{
    return '<div class="adm-dl__row"><dt>' . e($label) . '</dt><dd class="' . e($class) . '">' . ($valueHtml ?? '—') . '</dd></div>';
}

function detail_page(array $ctx, array $l, ?string $flash = null, ?string $error = null): string
{
    $t = static fn (?string $v) => $v === null || $v === '' ? null : e($v);
    $utm = [];
    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $k) {
        if ($l[$k]) {
            $utm[] = "$k={$l[$k]}";
        }
    }
    $statusOptions = '';
    foreach (STATUSES as $s) {
        $statusOptions .= '<option value="' . e($s) . '"' . ($s === $l['status'] ? ' selected' : '') . '>' . e(STATUS_LABELS[$s]) . '</option>';
    }
    $answers = dl_row(field_label('objective'), e(option_label('objective', $l['objective'])))
        . ($l['objective'] === 'other' ? dl_row(field_label('objective_other'), $t($l['objective_other'])) : '')
        . dl_row(field_label('company'), $t($l['company']))
        . dl_row(field_label('sector'), e(option_label('sector', $l['sector'])))
        . ($l['sector'] === 'other' ? dl_row(field_label('sector_other'), $t($l['sector_other'])) : '')
        . dl_row(field_label('job_role'), $t($l['job_role']))
        . dl_row(field_label('website'), $t($l['website']))
        . dl_row(field_label('company_size'), e(option_label('company_size', $l['company_size'])))
        . dl_row(field_label('challenge'), $t($l['challenge']), 'adm-pre')
        . dl_row(field_label('data_availability'), e(option_label('data_availability', $l['data_availability'])))
        . dl_row(field_label('timing'), e(option_label('timing', $l['timing'])))
        . dl_row(field_label('full_name'), $t($l['full_name']))
        . dl_row(field_label('email'), '<a href="mailto:' . e($l['email']) . '">' . e($l['email']) . '</a>')
        . dl_row(field_label('country'), e(country_label($l['country'])))
        . dl_row(field_label('whatsapp'), $t($l['whatsapp']));
    $record = dl_row('ID', e($l['public_id']))
        . dl_row('Recebida em', e(fmt_datetime($l['created_at'])))
        . dl_row('Atualizada em', e(fmt_datetime($l['updated_at'])))
        . dl_row('Último contato', e(fmt_date($l['last_contact_at'])))
        . dl_row('Idioma', e(LANG_LABELS[$l['lang']]))
        . dl_row('Versão do formulário', e($l['form_version']))
        . dl_row('Aviso de privacidade', e($l['privacy_notice_version'] . ' · exibido em ' . fmt_datetime($l['privacy_notice_shown_at'])))
        . dl_row('Novidades por e-mail', e($l['marketing_opt_in'] ? 'Sim (' . fmt_datetime($l['marketing_opt_in_at']) . ' · ' . $l['marketing_text_version'] . ')' : 'Não'))
        . dl_row('Origem', e($l['referrer_host'] ?: '—'))
        . dl_row('Campanha (UTM)', e($utm ? implode(' · ', $utm) : '—'))
        . dl_row('Aviso por e-mail', e(NOTIFICATION_LABELS[$l['notification_status']]));
    $id = e($l['public_id']);
    $body = '
      <p><a class="adm-link" href="/admin/leads">← Voltar à lista</a></p>
      <div class="adm-title"><h1>' . e($l['company']) . '</h1><span class="adm-status adm-status--' . e($l['status']) . '">' . e(STATUS_LABELS[$l['status']]) . '</span></div>
      ' . ($flash ? '<p class="adm-flash" role="status">' . e($flash) . '</p>' : '') . '
      ' . ($error ? '<p class="adm-alert" role="alert">' . e($error) . '</p>' : '') . '
      <div class="adm-grid">
        <section class="adm-card">
          <h2>Respostas</h2>
          <dl class="adm-dl">' . $answers . '</dl>
        </section>
        <div>
          <section class="adm-card">
            <h2>Atendimento</h2>
            <form method="post" action="/admin/leads/' . $id . '">
              <input type="hidden" name="_csrf" value="' . e($ctx['csrf']) . '" />
              <label for="status">Status</label>
              <select id="status" name="status">' . $statusOptions . '</select>
              <label for="last_contact">Data do último contato</label>
              <input id="last_contact" name="last_contact" type="date" value="' . e(iso_date($l['last_contact_at'])) . '" />
              <label for="notes">Observações internas</label>
              <textarea id="notes" name="notes" rows="8" maxlength="5000">' . e($l['internal_notes'] ?? '') . '</textarea>
              <button type="submit" class="adm-button">Salvar</button>
            </form>
          </section>
          <section class="adm-card">
            <h2>Registro</h2>
            <dl class="adm-dl adm-dl--compact">' . $record . '</dl>
            <p><a class="adm-link adm-link--danger" href="/admin/leads/' . $id . '/delete">Excluir solicitação…</a></p>
          </section>
        </div>
      </div>';
    return layout('Solicitação', $body, $ctx['admin'], $ctx['csrf']);
}

function delete_page(array $ctx, array $l): string
{
    $days = config()['retention_days'];
    $id = e($l['public_id']);
    $body = '<section class="adm-card adm-narrow">
      <h1>Excluir solicitação?</h1>
      <p>Você está prestes a excluir permanentemente a solicitação de <strong>' . e($l['company']) . '</strong>, recebida em ' . e(fmt_datetime($l['created_at'])) . '. Esta ação não pode ser desfeita pelo painel.</p>
      <p class="adm-muted">' . e($days
        ? "Política de retenção configurada: $days dias."
        : 'Não há prazo fixo de retenção configurado. Exclua a pedido do titular ou quando a solicitação não for mais necessária.') . '</p>
      <form method="post" action="/admin/leads/' . $id . '/delete">
        <input type="hidden" name="_csrf" value="' . e($ctx['csrf']) . '" />
        <label class="adm-check"><input type="checkbox" name="confirm" value="yes" required /> Confirmo a exclusão desta solicitação.</label>
        <div class="adm-actions"><button type="submit" class="adm-button adm-button--danger">Excluir definitivamente</button>
        <a class="adm-link" href="/admin/leads/' . $id . '">Cancelar</a></div>
      </form>
    </section>';
    return layout('Excluir solicitação', $body, $ctx['admin'], $ctx['csrf']);
}

function message_page(string $title, string $message, ?array $ctx = null): string
{
    return layout($title, '<section class="adm-card adm-narrow"><h1>' . e($title) . '</h1><p>' . e($message) . '</p><p><a class="adm-link" href="/admin/leads">Voltar</a></p></section>', $ctx['admin'] ?? null, $ctx['csrf'] ?? '');
}
