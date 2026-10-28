<?php
// Validação do formulário no servidor. Espelha shared/form-schema.js (o teste de paridade compara os dois).
declare(strict_types=1);

const CONTROL_CHARS_RE = '/[\x{0000}-\x{0008}\x{000B}\x{000C}\x{000E}-\x{001F}\x{007F}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u';
const EMAIL_RE = '/^[^\s@<>()\[\]\\\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/uD';
const HOST_RE = '/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/D';
const UTM_RE = '/^[\p{L}\p{N} _.\-+:|\/~()]+$/uD';

function clean_text(mixed $value, bool $multiline = false): string
{
    if (!is_string($value)) {
        return '';
    }
    $text = mb_scrub($value, 'UTF-8');
    if (class_exists('Normalizer')) {
        $text = Normalizer::normalize($text, Normalizer::FORM_C) ?: $text;
    }
    $text = preg_replace(CONTROL_CHARS_RE, '', $text);
    if ($multiline) {
        $text = preg_replace('/\r\n?/', "\n", $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
    } else {
        $text = preg_replace('/[\r\n\t]+/', ' ', $text);
        $text = preg_replace('/(*UCP)\s{2,}/u', ' ', $text);
    }
    return preg_replace('/(*UCP)^\s+|\s+$/u', '', $text);
}

function normalize_website(string $raw): array
{
    if ($raw === '') {
        return ['value' => null];
    }
    $max = schema()['LIMITS']['website'];
    if (mb_strlen($raw) > $max) {
        return ['error' => 'too_long'];
    }
    $withScheme = preg_match('~^https?://~i', $raw) ? $raw : 'https://' . $raw;
    $url = parse_url($withScheme);
    if ($url === false || !isset($url['host'], $url['scheme'])) {
        return ['error' => 'invalid_url'];
    }
    $scheme = strtolower($url['scheme']);
    if (!in_array($scheme, ['http', 'https'], true) || isset($url['user']) || isset($url['pass']) || !preg_match(HOST_RE, $url['host'])) {
        return ['error' => 'invalid_url'];
    }
    // Guarda apenas host e caminho: query strings e fragmentos podem carregar dados pessoais.
    $path = $url['path'] ?? '';
    $path = $path === '/' ? '' : preg_replace_callback('/[^\x21-\x7E]/', static fn ($m) => rawurlencode($m[0]), $path);
    $value = $scheme . '://' . strtolower($url['host']) . $path;
    return mb_strlen($value) > $max ? ['error' => 'too_long'] : ['value' => $value];
}

function normalize_phone(string $raw): array
{
    if ($raw === '') {
        return ['value' => null];
    }
    if (mb_strlen($raw) > 25 || !preg_match('/^\+?[\d\s().-]+$/D', $raw)) {
        return ['error' => 'invalid_phone'];
    }
    $digits = preg_replace('/\D/', '', $raw);
    if (!str_starts_with(trim($raw), '+') || strlen($digits) < 8 || strlen($digits) > 15) {
        return ['error' => 'invalid_phone'];
    }
    return ['value' => '+' . $digits];
}

/** Valida e normaliza as respostas. Retorna ['ok' => bool, 'value' => [...], 'errors' => [campo => código]]. */
function validate_lead(array $src): array
{
    $limits = schema()['LIMITS'];
    $options = schema()['OPTIONS'];
    $errors = [];
    $out = [];

    $text = static function (string $field, int $max, int $min = 2, bool $required = true, bool $multiline = false) use (&$errors, &$out, $src): void {
        $value = clean_text($src[$field] ?? null, $multiline);
        if ($value === '') {
            if ($required) {
                $errors[$field] = 'required';
            }
            $out[$field] = null;
            return;
        }
        $length = mb_strlen($value);
        if ($length < $min) {
            $errors[$field] = 'too_short';
        } elseif ($length > $max) {
            $errors[$field] = 'too_long';
        }
        $out[$field] = $value;
    };
    $choice = static function (string $field) use (&$errors, &$out, $src, $options): void {
        $value = is_string($src[$field] ?? null) ? $src[$field] : '';
        if ($value === '') {
            $errors[$field] = 'required';
        } elseif (!in_array($value, $options[$field], true)) {
            $errors[$field] = 'invalid_option';
        }
        $out[$field] = $value === '' ? null : $value;
    };

    $choice('objective');
    if ($out['objective'] === 'other') {
        $text('objective_other', $limits['objective_other']);
    } else {
        $out['objective_other'] = null;
    }

    $text('company', $limits['company']);
    $choice('sector');
    if ($out['sector'] === 'other') {
        $text('sector_other', $limits['sector_other']);
    } else {
        $out['sector_other'] = null;
    }
    $text('job_role', $limits['job_role']);
    $website = normalize_website(clean_text($src['website'] ?? null));
    if (isset($website['error'])) {
        $errors['website'] = $website['error'];
    }
    $out['website'] = $website['value'] ?? null;

    $choice('company_size');
    $text('challenge', $limits['challenge'], $limits['challenge_min'], true, true);
    $choice('data_availability');
    $choice('timing');

    $text('full_name', $limits['full_name']);
    $email = mb_strtolower(clean_text($src['email'] ?? null));
    if ($email === '') {
        $errors['email'] = 'required';
    } elseif (mb_strlen($email) > $limits['email'] || !preg_match(EMAIL_RE, $email)) {
        $errors['email'] = 'invalid_email';
    }
    $out['email'] = $email === '' ? null : $email;

    $country = is_string($src['country'] ?? null) ? strtoupper($src['country']) : '';
    if ($country === '') {
        $errors['country'] = 'required';
    } elseif (!in_array($country, schema()['COUNTRIES'], true)) {
        $errors['country'] = 'invalid_option';
    }
    $out['country'] = $country === '' ? null : $country;

    $phone = normalize_phone(clean_text($src['whatsapp'] ?? null));
    if (isset($phone['error'])) {
        $errors['whatsapp'] = $phone['error'];
    }
    $out['whatsapp'] = $phone['value'] ?? null;

    $optIn = $src['marketing_opt_in'] ?? null;
    $out['marketing_opt_in'] = $optIn === true || $optIn === 1 || in_array($optIn, ['true', 'on', '1'], true);

    return ['ok' => !$errors, 'value' => $out, 'errors' => $errors];
}

/** Metadados de origem (UTMs e host de referência). Valores inválidos são descartados, não rejeitados. */
function clean_attribution(array $src): array
{
    $out = [];
    foreach (schema()['UTM_FIELDS'] as $field) {
        $value = clean_text($src[$field] ?? null);
        $out[$field] = $value !== '' && mb_strlen($value) <= schema()['LIMITS']['utm'] && preg_match(UTM_RE, $value) ? $value : null;
    }
    $host = strtolower(clean_text($src['referrer_host'] ?? null));
    $out['referrer_host'] = $host !== '' && preg_match(HOST_RE, $host) ? $host : null;
    return $out;
}
