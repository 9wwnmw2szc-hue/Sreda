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
  aiFallback?: boolean;
  lastAiError?: string | null;
};

type InterviewResponse = {
  state: InterviewState;
  questions: { id: string; question: string }[];
  currentQuestion: { id: string; question: string } | null;
  text?: string;
};

const TEXT_KINDS: { id: string; label: string }[] = [
  { id: "greeting", label: "Приветствие" },
  { id: "faq", label: "FAQ" },
  { id: "after_lead", label: "После заявки" },
  { id: "after_order", label: "После заказа" },
  { id: "after_booking", label: "После записи" },
  { id: "admin_button", label: "Кнопка администратора" },
];

function summaryField(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function AiInterviewPanel({ businessId }: { businessId: string }) {
  const url = `/api/v1/businesses/${businessId}/ai/interview`;
  const profileUrl = `/api/v1/businesses/${businessId}/profile`;
  const [payload, setPayload] = useState<InterviewResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [holdApply, setHoldApply] = useState(false);
  const [textKind, setTextKind] = useState("greeting");
  const [draft, setDraft] = useState("");
  const [editMode, setEditMode] = useState(false);

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
      const data = await apiRequest<InterviewResponse & { text?: string }>(
        url,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      if (body.action !== "suggest_text") {
        // Prefer response state when present; refresh for currentQuestion.
        if (data?.state) setPayload((prev) => ({ ...(prev ?? data), ...data }));
        await refresh();
      }
      return data;
    } catch (e) {
      // Reload so answers survive recoverable errors.
      try {
        await refresh();
      } catch {
        /* keep prior local state */
      }
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
    const pending = answer.trim();
    const data = await post({
      action: "answer",
      questionId: q.id,
      answer: pending,
    });
    if (data) {
      setAnswer("");
      if (data.state?.aiFallback) {
        setNotice(
          "Ответы сохранены. AI временно недоступен — показано резюме из ваших ответов. Можно повторить анализ или подтвердить.",
        );
      } else {
        setNotice("Ответ сохранён.");
      }
    } else {
      // Keep typed answer on failure so the user can retry.
      setAnswer(pending);
    }
  }

  async function regenerate() {
    const data = await post({ action: "regenerate_summary" });
    if (!data) return;
    if (data.state?.aiFallback) {
      setNotice(
        "AI всё ещё недоступен. Резюме построено из ваших ответов — можно подтвердить или повторить позже.",
      );
    } else {
      setNotice("AI-анализ обновлён.");
    }
  }

  async function confirmSummary(apply: boolean) {
    const data = await post({ action: "confirm", apply });
    if (!data) return;
    setHoldApply(false);
    setNotice(
      apply
        ? "Резюме применено к AI-профилю."
        : "Подтверждено без перезаписи профиля.",
    );
  }

  async function suggestText(kind = textKind) {
    const data = await post({ action: "suggest_text", kind });
    if (data?.text) {
      setDraft(data.text);
      setEditMode(false);
      setNotice("Черновик готов — выберите, что с ним сделать.");
    }
  }

  async function applyDraft() {
    if (!draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const profile = await apiRequest<Record<string, string>>(profileUrl);
      const patch: Record<string, string> = { ...profile };
      if (textKind === "greeting") patch.greeting = draft.slice(0, 2000);
      else if (textKind === "faq")
        patch.ai_important_facts = [
          profile.ai_important_facts,
          "FAQ:\n" + draft,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 4000);
      else
        patch.ai_extra_instructions = [
          profile.ai_extra_instructions,
          `${textKind}:\n${draft}`,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 4000);
      await apiRequest(profileUrl, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setNotice("Текст сохранён в профиль. AI не перезаписывает его сам.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить текст.");
    } finally {
      setBusy(false);
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
          <h4>Вот как Соты поняли ваш бизнес</h4>
          {state?.aiFallback ? (
            <p className="account-notice" role="status">
              AI временно недоступен или вернул неполный ответ. Резюме собрано из
              ваших ответов — можно подтвердить или повторить анализ.
            </p>
          ) : null}
          {holdApply ? (
            <p className="text-body-sm">
              Профиль не перезаписан автоматически. Исправьте поля AI выше и
              сохраните профиль вручную — или нажмите «Всё верно».
            </p>
          ) : null}
          <dl className="stack-sm">
            <div>
              <dt>Название</dt>
              <dd>{summaryField(summary.name) || "—"}</dd>
            </div>
            <div>
              <dt>О бизнесе</dt>
              <dd>{summaryField(summary.about) || "—"}</dd>
            </div>
            <div>
              <dt>Тон</dt>
              <dd>{summaryField(summary.tone) || "—"}</dd>
            </div>
            <div>
              <dt>Важно рассказать</dt>
              <dd>{summaryField(summary.strengths) || "—"}</dd>
            </div>
            <div>
              <dt>FAQ</dt>
              <dd>{summaryField(summary.faq) || "—"}</dd>
            </div>
            <div>
              <dt>Ограничения</dt>
              <dd>{summaryField(summary.restrictions) || "—"}</dd>
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
              <button
                type="button"
                className="button button--outline"
                disabled={busy}
                onClick={() => void regenerate()}
              >
                {busy ? "Повторяем…" : "Повторить AI-анализ"}
              </button>
            </div>
          ) : (
            <div className="stack-md">
              <p className="text-body-sm">Интервью подтверждено.</p>
              <h4>Клиентские тексты</h4>
              <label>
                Тип текста
                <select
                  value={textKind}
                  onChange={(e) => {
                    setTextKind(e.target.value);
                    setDraft("");
                  }}
                >
                  {TEXT_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button button--outline"
                disabled={busy}
                onClick={() => void suggestText()}
              >
                {busy ? "Готовим…" : "Сформировать с AI"}
              </button>
              {draft ? (
                <div className="stack-sm">
                  {editMode ? (
                    <textarea
                      rows={5}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  ) : (
                    <div className="customer-preview__bubble">
                      <p>{draft}</p>
                    </div>
                  )}
                  <div className="message-actions">
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => void applyDraft()}
                    >
                      Использовать
                    </button>
                    <button
                      type="button"
                      className="button button--outline"
                      disabled={busy}
                      onClick={() => setEditMode(true)}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="button button--outline"
                      disabled={busy}
                      onClick={() => void suggestText()}
                    >
                      Другой вариант
                    </button>
                  </div>
                  <FieldHint>
                    Ничего не публикуется и не перезаписывается без вашей кнопки
                    «Использовать».
                  </FieldHint>
                </div>
              ) : null}
            </div>
          )}
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
        <div className="stack-md">
          <p className="text-body-sm">
            Ответы сохранены. Резюме ещё не готово — повторите AI-анализ.
          </p>
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => void regenerate()}
          >
            {busy ? "Повторяем…" : "Повторить AI-анализ"}
          </button>
        </div>
      )}
    </div>
  );
}
