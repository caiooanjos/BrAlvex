-- 002: limites de tentativas (formulário e login) e estado interno da aplicação.
-- rate_limits guarda apenas um HMAC da chave (IP ou e-mail), nunca o valor original, e as linhas expiram.
CREATE TABLE rate_limits (
  bucket CHAR(64) NOT NULL,
  window_start DATETIME(3) NOT NULL,
  hits INT UNSIGNED NOT NULL,
  PRIMARY KEY (bucket),
  KEY ix_rate_limits_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_state (
  name VARCHAR(64) NOT NULL,
  value VARCHAR(255) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
