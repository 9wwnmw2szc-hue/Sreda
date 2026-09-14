import Image from "next/image";
import { Brand } from "@/components/ui/Brand";

export function AccountFrame({ children }: { children: React.ReactNode }) {
  return <main className="account-page">
    <section className="account-story">
      <Brand />
      <div className="account-story__copy">
        <span className="eyebrow">Бизнесу проще</span>
        <h1>Ваш бизнес.<br />В своей среде.</h1>
        <p>Заявки, публикации и другие повседневные задачи — в одном рабочем пространстве.</p>
      </div>
      <Image className="account-story__art" src="/assets/sreda/v2/desk-platform-decor.webp"
        alt="" width={1000} height={700} priority sizes="(max-width: 900px) 100vw, 55vw" />
    </section>
    <section className="account-form-pane">
      <div className="account-form-shell">
        {children}
      </div>
    </section>
  </main>;
}
