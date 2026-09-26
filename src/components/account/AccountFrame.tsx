import Image from "next/image";
import { Brand } from "@/components/ui/Brand";
import { APP_TAGLINE } from "@/config/brand";

export function AccountFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="account-page">
      <section className="account-story">
        <Brand />
        <div className="account-story__copy">
          <span className="eyebrow">{APP_TAGLINE}</span>
          <h1>
            Ваш бизнес.
            <br />В гармонии.
          </h1>
          <p>
            Заявки, заказы, запись, сообщения и публикации — в одном рабочем
            пространстве БизнеСоты.
          </p>
        </div>
        <Image
          className="account-story__art"
          src="/assets/soty/brand/logo-mark.svg"
          alt=""
          width={280}
          height={280}
          priority
          sizes="(max-width: 900px) 40vw, 280px"
        />
      </section>
      <section className="account-form-pane">
        <div className="account-form-shell">{children}</div>
      </section>
    </main>
  );
}
