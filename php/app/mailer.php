<?php
// Aviso de nova solicitação para a equipe, via SMTP autenticado (sem dependências externas).
// Envia o mínimo necessário e um link para o painel protegido. Falhas aqui nunca afetam o lead já gravado.
declare(strict_types=1);

function mail_address(string $value): string
{
    $value = str_replace(["\r", "\n"], '', $value);
    return preg_match('/<([^>]+)>/', $value, $m) ? trim($m[1]) : trim($value);
}

function smtp_send(array $smtp, string $from, string $to, string $subject, string $body): void
{
    $host = $smtp['host'];
    $context = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host]]);
    $socket = @stream_socket_client(($smtp['secure'] ? 'ssl://' : 'tcp://') . $host . ':' . $smtp['port'], $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        throw new RuntimeException('smtp_connect_failed');
    }
    stream_set_timeout($socket, 15);
    $read = static function (array $codes) use ($socket): string {
        $reply = '';
        do {
            $line = fgets($socket, 1024);
            if ($line === false) {
                throw new RuntimeException('smtp_no_response');
            }
            $reply .= $line;
        } while (isset($line[3]) && $line[3] === '-');
        $code = (int) substr($line, 0, 3);
        if (!in_array($code, $codes, true)) {
            throw new RuntimeException('smtp_' . $code);
        }
        return $reply;
    };
    $send = static fn (string $command) => fwrite($socket, $command . "\r\n");
    try {
        $read([220]);
        $helo = parse_url(config()['site_url'], PHP_URL_HOST) ?: 'localhost';
        $send("EHLO $helo");
        $features = $read([250]);
        if (!$smtp['secure'] && stripos($features, 'STARTTLS') !== false) {
            $send('STARTTLS');
            $read([220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('smtp_tls_failed');
            }
            $send("EHLO $helo");
            $read([250]);
        }
        if (!empty($smtp['user'])) {
            $send('AUTH LOGIN');
            $read([334]);
            $send(base64_encode($smtp['user']));
            $read([334]);
            $send(base64_encode((string) $smtp['password']));
            $read([235]);
        }
        $send('MAIL FROM:<' . mail_address($from) . '>');
        $read([250]);
        $send('RCPT TO:<' . mail_address($to) . '>');
        $read([250, 251]);
        $send('DATA');
        $read([354]);
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . str_replace(["\r", "\n"], '', $from),
            'To: ' . mail_address($to),
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . uuid4() . '@' . $helo . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        $send(implode("\r\n", $headers) . "\r\n\r\n" . rtrim(chunk_split(base64_encode($body), 76, "\r\n")) . "\r\n.");
        $read([250]);
        $send('QUIT');
    } finally {
        fclose($socket);
    }
}

function notify_new_lead(string $publicId, string $lang, string $objective): string
{
    $c = config();
    $mark = static function (string $status) use ($publicId): void {
        try {
            q('UPDATE leads SET notification_status = ?, notification_attempted_at = UTC_TIMESTAMP(3) WHERE public_id = ?', [$status, $publicId]);
        } catch (Throwable $e) {
            log_event('error', 'notify.mark_failed', ['code' => $e->getCode()]);
        }
    };
    if (!$c['smtp'] || !$c['notify_from']) {
        // Sem serviço de envio configurado: registra a pendência, sem simular entrega.
        $mark('skipped');
        return 'skipped';
    }
    $body = implode("\n", [
        'Uma nova solicitação de teste foi registrada no site da BrAlveX.',
        '',
        'Idioma: ' . ($lang === 'en' ? 'Inglês' : 'Português'),
        'Objetivo: ' . $objective,
        '',
        'Veja os detalhes no painel (requer login): ' . $c['site_url'] . '/admin/leads/' . $publicId,
    ]);
    try {
        smtp_send($c['smtp'], $c['notify_from'], $c['notify_to'], 'Nova solicitação de teste (' . substr($publicId, 0, 8) . ')', $body);
        $mark('sent');
        return 'sent';
    } catch (Throwable $e) {
        log_event('error', 'notify.send_failed', ['code' => $e->getMessage()]);
        $mark('failed');
        return 'failed';
    }
}
