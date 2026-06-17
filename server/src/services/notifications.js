import nodemailer from 'nodemailer';
import { db } from '../db.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  return transporter;
}

export async function sendMentionEmail(toUserId, fromUserName, chatName, messageContent) {
  const transport = getTransporter();
  if (!transport) return;

  const user = await db.get('SELECT email, email_notifications, display_name FROM users WHERE id = $1', [toUserId]);
  if (!user || !user.email_notifications || !user.email) return;

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'Forevo <noreply@forevo.app>',
      to: user.email,
      subject: `${fromUserName} упомянул(а) вас в "${chatName}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6c5ce7;">Forevo</h2>
          <p><strong>${fromUserName}</strong> упомянул(а) вас в чате <strong>${chatName}</strong>:</p>
          <blockquote style="border-left: 3px solid #6c5ce7; padding-left: 12px; color: #555; margin: 16px 0;">
            ${messageContent}
          </blockquote>
          <a href="${process.env.APP_URL || 'https://forevo-app.onrender.com'}" style="display: inline-block; background: #6c5ce7; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 12px;">Открыть Forevo</a>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">Отключить уведомления можно в настройках профиля.</p>
        </div>
      `,
    });
    console.log(`[EMAIL] Mention email sent to ${user.email}`);
  } catch (err) {
    console.error('[EMAIL] Failed to send mention email:', err.message);
  }
}

export async function sendOfflineMessageEmail(toUserId, fromUserName, chatName, messageContent) {
  const transport = getTransporter();
  if (!transport) return;

  const user = await db.get('SELECT email, email_notifications FROM users WHERE id = $1', [toUserId]);
  if (!user || !user.email_notifications || !user.email) return;

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'Forevo <noreply@forevo.app>',
      to: user.email,
      subject: `Новое сообщение от ${fromUserName} в "${chatName}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6c5ce7;">Forevo</h2>
          <p><strong>${fromUserName}</strong> отправил(а) вам сообщение в чате <strong>${chatName}</strong>:</p>
          <blockquote style="border-left: 3px solid #6c5ce7; padding-left: 12px; color: #555; margin: 16px 0;">
            ${messageContent}
          </blockquote>
          <a href="${process.env.APP_URL || 'https://forevo-app.onrender.com'}" style="display: inline-block; background: #6c5ce7; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 12px;">Открыть Forevo</a>
        </div>
      `,
    });
    console.log(`[EMAIL] Offline message email sent to ${user.email}`);
  } catch (err) {
    console.error('[EMAIL] Failed to send offline message email:', err.message);
  }
}
