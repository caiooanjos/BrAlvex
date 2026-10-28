<?php
// Rotas públicas: páginas do formulário (com token novo), token avulso e envio de solicitação.
declare(strict_types=1);

const FORM_TOKEN_PLACEHOLDER = '__FORM_TOKEN__';
const BODY_LIMIT = 16384;
const SUBMISSION_KEY_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD';
const CHOICE_FIELDS = ['objective', 'sector', 'company_size', 'data_availability', 'timing', 'country'];

/** Páginas do formulário recebem um token novo a cada carregamento (armadilha de tempo contra spam). */
function trial_page(string $publicDir, string $route): void
{
    $page = file_get_contents($publicDir . $route . 'index.html');
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo str_replace(FORM_TOKEN_PLACEHOLDER, form_token_issue(), $page);
}

function form_token_route(): void
{
    json_response(200, ['token' => form_token_issue()]);
}

function error_messages(array $c, array $errors): array
{
    $messages = [];
    foreach ($errors as $field => $code) {
        $message = $c['errors'][$code] ?? $c['errors']['invalid_option'];
        if ($code === 'required' && in_array($field, CHOICE_FIELDS, true)) {
            $message = $c['errors']['requiredChoice'];
        }
        if ($code === 'too_short' && $field === 'challenge') {
            $message = str_replace('{min}', (string) schema()['LIMITS']['challenge_min'], $c['errors']['challengeShort']);
        }
        $messages[] = ($c['fields'][$field] ?? $field) . ': ' . $message;
    }
    return $messages;
}

/** Página de erro para o envio sem JavaScript, no idioma do formulário. */
function nojs_page(string $lang, int $status, array $messages): void
{
    $template = file_get_contents(generated('nojs-' . ($lang === 'en' ? 'en' : 'pt') . '.html'));
    $items = implode('', array_map(static fn ($m) => '<li>' . e($m) . '</li>', $messages));
    html_response($status, str_replace('<li>@@MESSAGES@@</li>', $items, $template));
}

function failure_message(string $lang, string $key): string
{
    return str_replace('{email}', 'contact@bralvex.com', content($lang)['failure'][$key]);
}

/** Resposta no formato adequado: JSON para o formulário com JavaScript, HTML para o envio sem JavaScript. */
function lead_reply(bool $isForm, string $lang, int $status, array $body): void
{
    if (!$isForm) {
        json_response($status, $body);
        return;
    }
    $c = content($lang);
    if ($body['ok']) {
        redirect(303, $c['routes']['trialReceived']);
        return;
    }
    if (isset($body['errors'])) {
        nojs_page($lang, $status, error_messages($c, $body['errors']));
        return;
    }
    $key = match ($body['error']) {
        'rate_limited' => 'rate',
        'token_expired' => 'expired',
        'rejected' => 'rejected',
        default => 'server',
    };
    nojs_page($lang, $status, [failure_message($lang, $key)]);
}

function request_content_type(): string
{
    return strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
}

function submit_lead(): void
{
    $type = request_content_type();
    $isForm = $type === 'application/x-www-form-urlencoded';
    $formLang = $isForm && ($_POST['lang'] ?? '') === 'en' ? 'en' : 'pt';

    if (!same_origin_ok()) {
        json_response(403, ['ok' => false, 'error' => 'forbidden']);
        return;
    }
    ensure_ready();
    $limit = config()['lead_rate'];
    if (!rate_hit('lead', client_ip(), $limit['max'], $limit['window'])) {
        header('Retry-After: ' . $limit['window'] * 60);
        lead_reply($isForm, $formLang, 429, ['ok' => false, 'error' => 'rate_limited']);
        return;
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > BODY_LIMIT) {
        json_response(413, ['ok' => false, 'error' => 'payload_too_large']);
        return;
    }
    if ($type === 'application/json') {
        $raw = file_get_contents('php://input', false, null, 0, BODY_LIMIT + 1);
        if (strlen($raw) > BODY_LIMIT) {
            json_response(413, ['ok' => false, 'error' => 'payload_too_large']);
            return;
        }
        $body = json_decode($raw, true, 8);
        if (!is_array($body) || array_is_list($body) && $body !== []) {
            json_response(400, ['ok' => false, 'error' => 'invalid_json']);
            return;
        }
    } elseif ($isForm) {
        if (count($_POST) > 60) {
            json_response(413, ['ok' => false, 'error' => 'payload_too_large']);
            return;
        }
        $body = $_POST;
    } else {
        json_response(415, ['ok' => false, 'error' => 'unsupported_media_type']);
        return;
    }

    // Campo-armadilha invisível para pessoas.
    if (array_key_exists('fax_number', $body) && (!is_string($body['fax_number']) || trim($body['fax_number']) !== '')) {
        lead_reply($isForm, $formLang, 400, ['ok' => false, 'error' => 'rejected']);
        return;
    }
    $tokenState = form_token_verify($body['form_token'] ?? null);
    if ($tokenState === 'expired') {
        lead_reply($isForm, $formLang, 400, ['ok' => false, 'error' => 'token_expired']);
        return;
    }
    if ($tokenState !== 'ok') {
        lead_reply($isForm, $formLang, 400, ['ok' => false, 'error' => 'rejected']);
        return;
    }
    $s = schema();
    if (($body['form_version'] ?? null) !== $s['FORM_VERSION'] || ($body['privacy_notice_version'] ?? null) !== $s['PRIVACY_NOTICE_VERSION']) {
        lead_reply($isForm, $formLang, 400, ['ok' => false, 'error' => 'outdated']);
        return;
    }
    $lang = $body['lang'] ?? null;
    if ($lang !== 'pt' && $lang !== 'en') {
        lead_reply($isForm, $formLang, 400, ['ok' => false, 'error' => 'rejected']);
        return;
    }
    $submissionKey = $body['submission_key'] ?? '';
    if ($submissionKey === '' || $submissionKey === null) {
        $submissionKey = uuid4();
    }
    if (!is_string($submissionKey) || !preg_match(SUBMISSION_KEY_RE, $submissionKey)) {
        lead_reply($isForm, $lang, 400, ['ok' => false, 'error' => 'rejected']);
        return;
    }

    $result = validate_lead($body);
    if (!$result['ok']) {
        lead_reply($isForm, $lang, 422, ['ok' => false, 'errors' => $result['errors']]);
        return;
    }
    $saved = insert_lead($result['value'], [
        'submission_key' => strtolower($submissionKey),
        'lang' => $lang,
        'form_version' => $s['FORM_VERSION'],
        'privacy_notice_version' => $s['PRIVACY_NOTICE_VERSION'],
        'marketing_text_version' => $s['MARKETING_TEXT_VERSION'],
        'attribution' => clean_attribution($body),
    ]);
    log_event('info', 'lead.created', ['duplicate' => $saved['duplicate']]);

    // Resposta só depois da gravação confirmada no banco; o aviso por e-mail vem depois e não altera o resultado.
    lead_reply($isForm, $lang, $saved['duplicate'] ? 200 : 201, ['ok' => true]);
    if (!$saved['duplicate']) {
        finish_response();
        notify_new_lead($saved['public_id'], $lang, $result['value']['objective']);
    }
}

function finish_response(): void
{
    ignore_user_abort(true);
    if (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } elseif (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        flush();
    }
}
