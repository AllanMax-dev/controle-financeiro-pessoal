import Image from "next/image";
import { redirect } from "next/navigation";

import { getCurrentAccess } from "@/modules/access/application/get-current-access";

export const dynamic = "force-dynamic";

function AccessRequired() {
  return (
    <main className="access-page access-page-premium">
      <section className="access-shell" aria-labelledby="access-title">
        <div className="access-content">
          <div className="brand-mark" aria-hidden="true">
            MF
          </div>
          <p className="eyebrow">Espaço financeiro privado</p>
          <h1 id="access-title">Use seu link pessoal de acesso</h1>
          <p>
            Este endereço não possui formulário de login. Abra o link privado criado para você e o acesso
            será reconhecido neste dispositivo.
          </p>
          <ul className="access-trust-list">
            <li>Acesso por sessão segura</li>
            <li>Sem senha compartilhada nesta tela</li>
            <li>Dados isolados por workspace</li>
          </ul>
        </div>
        <div className="access-visual" aria-hidden="true">
          <Image
            alt=""
            height={320}
            priority
            src="/illustrations/private-access.svg"
            width={440}
          />
        </div>
      </section>
    </main>
  );
}

export default async function HomePage() {
  const access = await getCurrentAccess();

  if (!access) {
    return <AccessRequired />;
  }

  redirect("/painel");
}
