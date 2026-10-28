<?php
// Ponte de testes: executa funções do back end PHP com entradas JSON (stdin) e devolve JSON (stdout).
declare(strict_types=1);

$app = dirname(__DIR__, 2) . '/php/app';
require $app . '/bootstrap.php';
require $app . '/validation.php';
require $app . '/security.php';
require $app . '/leads.php';

$input = json_decode(stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
$out = match ($input['op']) {
    'validate' => array_map(static fn ($case) => validate_lead($case), $input['cases']),
    'attribution' => array_map(static fn ($case) => clean_attribution($case), $input['cases']),
    'csv' => ['cells' => array_map('csv_cell', $input['cells']), 'bom' => str_starts_with(to_csv(['a'], [['-1']]), "\xEF\xBB\xBF")],
    'escape' => e($input['value']),
    'token' => (static function (): array {
        $token = form_token_issue();
        $oldPayload = (now_ms() - 49 * 3600 * 1000) . '.abc';
        $tampered = substr($token, 0, -1) . (str_ends_with($token, 'A') ? 'B' : 'A');
        return [
            'fresh' => form_token_verify($token),
            'expired' => form_token_verify($oldPayload . '.' . form_token_sign($oldPayload)),
            'tampered' => form_token_verify($tampered),
            'missing' => form_token_verify(null),
            'garbage' => form_token_verify('1.2'),
        ];
    })(),
};
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
