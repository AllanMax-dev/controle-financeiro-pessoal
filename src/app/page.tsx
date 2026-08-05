import { redirect } from "next/navigation";

import { getCurrentAccess } from "@/modules/access/application/get-current-access";

export const dynamic = "force-dynamic";

function AccessRequired() {
  return (
    <main className="access-page">
      <section className="access-card" aria-labelledby="access-title">
        <div className="brand-mark" aria-hidden="true">
          MF
        </div>
        <p className="eyebrow">Espaço financeiro privado</p>
        <h1 id="access-title">Use seu link pessoal de acesso</h1>
        <p>
          Este endereço não possui formulário de login. Abra o link privado criado para você e o acesso
          será reconhecido neste dispositivo.
        </p>
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
