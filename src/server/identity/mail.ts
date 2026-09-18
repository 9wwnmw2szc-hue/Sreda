import nodemailer from "nodemailer";
import { AppError } from "../http/errors.ts";

export async function sendCode(email: string, code: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !pass || !from || ![465, 587].includes(port)) {
    throw new AppError(503, "MAIL_UNAVAILABLE", "Не удалось отправить письмо. Попробуйте позже.");
  }
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: true,
    auth: { user, pass }, connectionTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false,
  });
  try {
    await transport.sendMail({
      from, to: email, subject: "Код входа в Соты",
      text: `Ваш код входа: ${code}\n\nОн действует 5 минут. Если вы не запрашивали вход, просто проигнорируйте письмо.`,
    });
  } finally {
    transport.close();
  }
}
