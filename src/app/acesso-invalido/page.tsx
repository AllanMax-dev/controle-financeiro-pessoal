import Link from "next/link";

export default function InvalidAccessPage() {
  return (
    <main className="access-page">
      <section className="access-card" aria-labelledby="invalid-access-title">
        <div className="brand-mark" aria-hidden="true">
          MF
        </div>
        <p className="eyebrow">Acesso não reconhecido</p>
        <h1 id="invalid-access-title">Este link não é válido.</h1>
        <p>Solicite um novo endereço privado ao responsável pelo projeto.</p>
        <Link className="secondary-link" href="/">
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
