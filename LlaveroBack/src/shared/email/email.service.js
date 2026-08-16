'use strict';
const nodemailer = require('nodemailer');
const { createLogger } = require('../utils/logger');
const log = createLogger('Email');

// Relay SMTP interno de la UCO: autoriza por IP de origen, no por
// credenciales — sin TLS/STARTTLS (texto plano) y sin auth a propósito.
// `MAIL_HOST_FALLBACK` (IP directa) se usa si falla la resolución DNS del
// hostname, ya que el relay solo es alcanzable desde la red interna.
const MAIL_HOST = process.env.MAIL_HOST || 'mail.uco.edu.co';
const MAIL_HOST_FALLBACK = process.env.MAIL_HOST_FALLBACK || '172.16.1.6';
const MAIL_PORT = Number(process.env.MAIL_PORT) || 25;
const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@uco.edu.co';
const MAIL_TIMEOUT_MS = 30000;

function buildTransporter(host) {
  return nodemailer.createTransport({
    host,
    port: MAIL_PORT,
    secure: false,
    ignoreTLS: true, // no intentar STARTTLS oportunista, el relay no lo soporta
    auth: undefined,
    connectionTimeout: MAIL_TIMEOUT_MS,
    greetingTimeout: MAIL_TIMEOUT_MS,
    socketTimeout: MAIL_TIMEOUT_MS,
  });
}

let _transporter = null;
function getTransporter() {
  if (!_transporter) _transporter = buildTransporter(MAIL_HOST);
  return _transporter;
}

/** Errores de resolución/conexión que justifican reintentar con la IP fallback. */
function esErrorDeConexion(err) {
  return ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err?.code);
}

async function enviarConFallback(mailOptions) {
  try {
    return await getTransporter().sendMail(mailOptions);
  } catch (err) {
    if (!esErrorDeConexion(err) || MAIL_HOST === MAIL_HOST_FALLBACK) throw err;
    log.warn(`No se pudo conectar a ${MAIL_HOST}, reintentando con IP fallback ${MAIL_HOST_FALLBACK}`, err);
    return buildTransporter(MAIL_HOST_FALLBACK).sendMail(mailOptions);
  }
}

async function sendEmail({ to, subject, html }) {
  const info = await enviarConFallback({
    from: `"Llavero" <${MAIL_FROM}>`,
    to,
    subject,
    html,
  });

  log.info(`Correo enviado a ${to} — messageId: ${info.messageId}`);
  return { id: info.messageId };
}

async function sendBulkEmails(emails) {
  const results = [];

  for (const email of emails) {
    try {
      const data = await sendEmail(email);
      results.push({ to: email.to, estado: 'enviado', id: data?.id });
    } catch (err) {
      log.error(`Fallo envío a ${email.to}`, err);
      results.push({ to: email.to, estado: 'fallido', error: err.message });
    }
  }

  return results;
}

module.exports = { sendEmail, sendBulkEmails };
