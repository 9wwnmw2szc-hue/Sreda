"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { FieldHint } from "@/components/ui/SetupChrome";
import { FIELD_HINTS } from "@/lib/setupUx";

type InterviewSummary = {
  name: string;
  about: string;
  tone: string;
  strengths: string;
  faq: string;
  restrictions: string;
};

type InterviewState = {
  version: 1;
  step: number;
  answers: { id: string; question: string; answer: string }[];
  clarifying: { id: string; question: string; answer: string }[];
  summary: InterviewSummary | null;
  confirmed: boolean;
};

type InterviewResponse = {
  state: InterviewState;
  questions: { id: string; question: string }[];
  currentQuestion: { id: string; question: string } | null;
  text?: string;
};

export function AiInterviewPanel({ businessId }: { businessId: string }) {
  const url = `/api/v1/businesses/${businessId}/ai/interview`;
  const [payload, setPayload] = useState<InterviewResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [greetingDraft, setGreetingDraft] = useState("");
  const [holdApply, setHoldApply] = useState(false);

  async function refresh() {
    const data = await apiRequest<InterviewResponse>(url);
    setPayload(data);
    return data;
  }

  useEffect(() => {
    let active = true;
    void apiRequest<InterviewResponse>(url)
      .then((data) => {
        if (active) setPayload(data);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Не удалось загрузить.");
      });
    return () => {
      active = false;
    };
  }, [url]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest<InterviewResponse>(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refresh();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    const q = payload?.currentQuestion;
    if (!q || !answer.trim()) {
      setError("Введите ответ на вопрос.");
      return;
    }
    const data = await post({
      action: "answer",
      questionId: q.id,
      answer: answer.trim(),
    });
    if (data) {
      setAnswer("");
      setNotice("Ответ сохранён.");
    }
  }

  async function confirmSummary(apply: boolean) {
    const data = await post({ action: "confirm", apply });
    if (!data) return;
    setHoldApply(false);
    if (apply) {
      setNotice("Резюме применено к AI-профилю.");
      setBusy(true);
      try {
        const draft = await apiRequest<InterviewResponse>(url, {
          method: "POST",
          body: JSON.stringify({ action: "suggest_text", kind: "greeting" }),
        });
        if (draft.text) setGreetingDraft(draft.text);
      } catch {
        /* optional */
      } finally {
        setBusy(false);
      }
    } else {
      setNotice("Подтверждено без перезаписи профиля.");
    }
  }

  const state = payload?.state;
  const question = payload?.currentQuestion;
  const summary = state?.summary;
  const showSummary = Boolean(summary) && !question;

  return (
    <div className="stack-md ai-interview-panel">
      <h3>AI-интервью</h3>
      <p className="text-body-sm">
        Короткие вопросы помогут заполнить профиль. AI не придумывает цены,
        наличие и расписание.
      </p>
      <FieldHint>{FIELD_HINTS.aiRestrictions}</FieldHint>

      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="account-notice" role="status">
          {notice}
        </p>
      ) : null}

      {!payload ? (
        <p>Загружаем интервью…</p>
      ) : showSummary && summary ? (
        <div className="stack-md">
          <h4>Резюме</h4>
          {holdApply ? (
            <p className="text-body-sm">
              Профиль не перезаписан автоматически. Исправьте поля AI выше и
              сохраните профиль вручную — или нажмите «Всё верно», чтобы
              применить резюме.
            </p>
          ) : null}
          <dl className="stack-sm">
            <div>
              <dt>Название</dt>
              <dd>{summary.name || "—"}</dd>
            </div>
            <div>
              <dt>О бизнесе</dt>
              <dd>{summary.about || "—"}</dd>
            </div>
            <div>
              <dt>Тон</dt>
              <dd>{summary.tone || "—"}</dd>
            </div>
            <div>
              <dt>Важно рассказать</dt>
              <dd>{summary.strengths || "—"}</dd>
            </div>
            <div>
              <dt>FAQ</dt>
              <dd>{summary.faq || "—"}</dd>
            </div>
            <div>
              <dt>Ограничения</dt>
              <dd>{summary.restrictions || "—"}</dd>
            </div>
          </dl>
          {!state?.confirmed ? (
            <div className="message-actions">
              <button
                type="button"
                className="button button--primary"
                disabled={busy}
                onClick={() => void confirmSummary(true)}
              >
                Всё верно
              </button>
              <button
                type="button"
                className="button button--outline"
                disabled={busy}
                onClick={() => {
                  setHoldApply(true);
                  setNotice(
                    "Изменения не применяются сами — отредактируйте поля AI и сохраните профиль.",
                  );
                }}
              >
                Изменить
              </button>
            </div>
          ) : (
            <p className="text-body-sm">Интервью подтверждено.</p>
          )}
          {greetingDraft ? (
            <div className="stack-sm">
              <h4>Черновик приветствия</h4>
              <div className="customer-preview__bubble">
                <p>{greetingDraft}</p>
              </div>
              <FieldHint>
                Черновик не публикуется сам — скопируйте в поле «Приветствие»
                при необходимости.
              </FieldHint>
            </div>
          ) : null}
        </div>
      ) : question ? (
        <div className="stack-md">
          <p className="eyebrow">
            Вопрос {(state?.step ?? 0) + 1} из {payload.questions.length}
          </p>
          <p className="text-body">{question.question}</p>
          <label className="stack-sm">
            Ваш ответ
            <textarea
              value={answer}
              disabled={busy}
              rows={4}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Ответьте своими словами"
            />
          </label>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || !answer.trim()}
            onClick={() => void submitAnswer()}
          >
            {busy ? "Отправляем…" : "Ответить"}
          </button>
        </div>
      ) : (
        <p className="text-body-sm">Интервью завершено.</p>
      )}
    </div>
  );
}
