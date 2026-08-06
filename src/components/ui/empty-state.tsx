import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icons";

type EmptyStateAction = {
  href: string;
  label: string;
};

export function EmptyState({
  action,
  description,
  icon = "archive",
  secondaryAction,
  title,
}: {
  action?: EmptyStateAction;
  description: string;
  icon?: IconName;
  secondaryAction?: EmptyStateAction;
  title: string;
}) {
  return (
    <section className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action || secondaryAction ? (
        <div className="empty-state-actions">
          {action ? (
            <Link className="primary-button" href={action.href}>
              {action.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link className="secondary-button" href={secondaryAction.href}>
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
