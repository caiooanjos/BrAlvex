// Log estruturado mínimo. Nunca registre senhas, tokens, cookies ou conteúdo do formulário.
function write(level, event, fields = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  (level === "error" ? console.error : console.log)(line);
}

export const log = {
  info: (event, fields) => write("info", event, fields),
  error: (event, fields) => write("error", event, fields),
};

export const silentLog = { info() {}, error() {} };
