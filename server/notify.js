// Aviso de nova solicitação para a equipe. Envia o mínimo necessário e um link para o painel protegido.
// Falhas aqui nunca afetam o lead já gravado.
import nodemailer from "nodemailer";
import { q } from "./db.js";

export function createNotifier(config, pool, log) {
  const transport =
    config.smtp && config.notifyFrom
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        })
      : null;

  async function mark(publicId, status) {
    try {
      await q(
        pool,
        "UPDATE leads SET notification_status = ?, notification_attempted_at = UTC_TIMESTAMP(3) WHERE public_id = ?",
        [status, publicId],
      );
    } catch (err) {
      log.error("notify.mark_failed", { code: err.code });
    }
  }

  return {
    configured: Boolean(transport),
    async notifyNewLead({ publicId, lang, objective }) {
      if (!transport) {
        // Sem serviço de envio configurado: registra a pendência, sem simular entrega.
        await mark(publicId, "skipped");
        return "skipped";
      }
      const link = `${config.siteUrl}/admin/leads/${publicId}`;
      try {
        await transport.sendMail({
          from: config.notifyFrom,
          to: config.notifyTo,
          subject: `Nova solicitação de teste (${publicId.slice(0, 8)})`,
          text: [
            "Uma nova solicitação de teste foi registrada no site da BrAlveX.",
            "",
            `Idioma: ${lang === "en" ? "Inglês" : "Português"}`,
            `Objetivo: ${objective}`,
            "",
            `Veja os detalhes no painel (requer login): ${link}`,
          ].join("\n"),
        });
        await mark(publicId, "sent");
        return "sent";
      } catch (err) {
        log.error("notify.send_failed", { code: err.code || err.responseCode || "unknown" });
        await mark(publicId, "failed");
        return "failed";
      }
    },
  };
}
