import Image from "next/image";
import Link from "next/link";

export default function InvalidAccessPage() {
  return (
    <main className="access-page access-page-premium">
      <section className="access-shell access-shell-invalid" aria-labelledby="invalid-access-title">
        <div className="access-content">
          <div className="brand-mark" aria-hidden="true">
            MF
          </div>
          <p className="eyebrow">Acesso não reconhecido</p>
          <h1 id="invalid-access-title">Este link não é válido.</h1>
          <p>Solicite um novo endereço privado ao responsável pelo projeto.</p>
          <Link className="secondary-link" href="/">
            Voltar ao início
          </Link>
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
