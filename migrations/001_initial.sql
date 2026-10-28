-- 001: estrutura inicial (solicitações de teste, administradores, sessões e auditoria).
-- Compatível com MySQL 8+ e MariaDB 10.6+. Datas sempre em UTC.

CREATE TABLE leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(36) NOT NULL,
  submission_key CHAR(36) NOT NULL,
  lang ENUM('pt','en') NOT NULL,
  form_version VARCHAR(40) NOT NULL,
  objective VARCHAR(32) NOT NULL,
  objective_other VARCHAR(120) NULL,
  company VARCHAR(150) NOT NULL,
  sector VARCHAR(32) NOT NULL,
  sector_other VARCHAR(120) NULL,
  job_role VARCHAR(100) NOT NULL,
  website VARCHAR(200) NULL,
  company_size VARCHAR(16) NOT NULL,
  challenge VARCHAR(1000) NOT NULL,
  data_availability VARCHAR(16) NOT NULL,
  timing VARCHAR(16) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL,
  country CHAR(2) NOT NULL,
  whatsapp VARCHAR(20) NULL,
  privacy_notice_version VARCHAR(40) NOT NULL,
  privacy_notice_shown_at DATETIME(3) NOT NULL,
  marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  marketing_opt_in_at DATETIME(3) NULL,
  marketing_text_version VARCHAR(40) NULL,
  referrer_host VARCHAR(253) NULL,
  utm_source VARCHAR(100) NULL,
  utm_medium VARCHAR(100) NULL,
  utm_campaign VARCHAR(100) NULL,
  utm_term VARCHAR(100) NULL,
  utm_content VARCHAR(100) NULL,
  status ENUM('new','contacting','evaluating','approved_for_trial','closed') NOT NULL DEFAULT 'new',
  internal_notes TEXT NULL,
  last_contact_at DATETIME(3) NULL,
  notification_status ENUM('pending','sent','skipped','failed') NOT NULL DEFAULT 'pending',
  notification_attempted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_leads_public_id (public_id),
  UNIQUE KEY uq_leads_submission_key (submission_key),
  KEY ix_leads_created (created_at),
  KEY ix_leads_status_created (status, created_at),
  KEY ix_leads_lang_created (lang, created_at),
  KEY ix_leads_objective_created (objective, created_at),
  KEY ix_leads_email (email),
  KEY ix_leads_company (company),
  KEY ix_leads_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  password_changed_at DATETIME(3) NOT NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sid_hash guarda o SHA-256 do identificador da sessão: um vazamento da tabela não entrega sessões válidas.
CREATE TABLE admin_sessions (
  sid_hash CHAR(64) NOT NULL,
  admin_id INT UNSIGNED NULL,
  data TEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (sid_hash),
  KEY ix_admin_sessions_expires (expires_at),
  KEY ix_admin_sessions_admin (admin_id),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro mínimo de ações administrativas. Não copia respostas do formulário.
CREATE TABLE admin_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  lead_public_id CHAR(36) NULL,
  meta VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_audit_created (created_at),
  KEY ix_audit_lead (lead_public_id),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
