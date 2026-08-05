import { notFound } from "next/navigation";

import { CategoryForm } from "@/components/category-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { updateCategoryAction } from "@/modules/categories/application/category-actions";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireCurrentAccess();
  const { id } = await params;
  const category = await getDatabase().category.findFirst({
    where: { id, workspaceId: access.workspaceId },
  });

  if (!category) {
    notFound();
  }

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Categorias</p>
          <h1>Editar categoria</h1>
          <p>Lançamentos existentes acompanham o novo nome e a nova cor.</p>
        </div>
      </section>
      <CategoryForm
        action={updateCategoryAction}
        defaults={{
          color: category.color ?? "#256b4b",
          id: category.id,
          kind: category.kind,
          name: category.name,
          version: category.version,
        }}
        submitLabel="Salvar alterações"
      />
    </>
  );
}
