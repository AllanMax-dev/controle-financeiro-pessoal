import { AccountForm } from "@/components/account-form";
import { createAccountAction } from "@/modules/accounts/application/account-actions";

export default function NewAccountPage() {
  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Contas</p>
          <h1>Nova conta</h1>
          <p>Informe o saldo existente antes do primeiro lançamento.</p>
        </div>
      </section>
      <AccountForm
        action={createAccountAction}
        defaults={{ color: "#256b4b", initialBalance: "0,00", name: "", type: "CHECKING" }}
        submitLabel="Criar conta"
      />
    </>
  );
}
