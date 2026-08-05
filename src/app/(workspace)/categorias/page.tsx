import Link from "next/link";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { toggleCategoryActiveAction } from "@/modules/categories/application/category-actions";

export default async function CategoriesPage() {
  const access = await requireCurrentAccess();
  const categories = await getDatabase().category.findMany({
    where: { workspaceId: access.workspaceId },
    orderBy: [{ active: "desc" }, { kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Classificação</p>
          <h1>Categorias</h1>
          <p>Organize receitas e despesas sem perder o histórico das categorias arquivadas.</p>
        </div>
        <Link className="primary-button" href="/categorias/nova">
          Nova categoria
        </Link>
      </section>

      {categories.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhuma categoria cadastrada</h2>
          <p>Crie categorias para entender a composição dos seus lançamentos.</p>
          <Link className="primary-button" href="/categorias/nova">
            Criar categoria
          </Link>
        </section>
      ) : (
        <section className="entity-list" aria-label="Categorias cadastradas">
          {categories.map((category) => (
            <article className={`entity-row${category.active ? "" : " entity-row-muted"}`} key={category.id}>
              <span className="entity-color" style={{ backgroundColor: category.color ?? "#256b4b" }} />
              <div className="entity-main">
                <strong>{category.name}</strong>
                <span>{category.kind === "INCOME" ? "Receita" : "Despesa"}</span>
              </div>
              <div className="entity-value">
                <strong>{category._count.transactions}</strong>
                <span>{category._count.transactions === 1 ? "lançamento" : "lançamentos"}</span>
              </div>
              <div className="row-actions">
                <Link className="text-button" href={`/categorias/${category.id}/editar`}>
                  Editar
                </Link>
                <form action={toggleCategoryActiveAction}>
                  <input name="id" type="hidden" value={category.id} />
                  <input name="version" type="hidden" value={category.version} />
                  <input name="active" type="hidden" value={String(!category.active)} />
                  <button className="text-button" type="submit">
                    {category.active ? "Arquivar" : "Reativar"}
                  </button>
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
