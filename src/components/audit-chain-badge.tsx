// The audit chain's state above the audit table (docs/features/audit-chain.md): intact with
// the entry count and the head hash a person can copy as an anchor, or the first broken entry
// and why. A server component; the page passes the verdict and the translator.
import type { AuditChainVerdict } from '@/domain/audit';
import type { Translate } from '@/i18n/get-t';
import { Badge, Card } from './ui';

type AuditChainBadgeProps = {
  verdict: AuditChainVerdict;
  t: Translate;
};

/** `ab12…ef`: enough of a hash to recognise it at a glance. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

export function AuditChainBadge({ verdict, t }: AuditChainBadgeProps) {
  return (
    <Card className="mb-6">
      <div className="space-y-3 text-sm">
        {verdict.ok ? (
          <Badge tone="success">
            {t('audit.chain.intact', {
              count: verdict.length,
              head: shortHash(verdict.headHash),
            })}
          </Badge>
        ) : (
          <Badge tone="danger">
            {t('audit.chain.broken', {
              id: verdict.brokenAt,
              reason: t(`audit.chain.reason.${verdict.reason}`),
            })}
          </Badge>
        )}
        <p className="text-ink-muted">{t('audit.chain.explain')}</p>
        {verdict.ok ? (
          <div>
            <p className="font-medium">{t('audit.chain.headLabel')}</p>
            <code className="font-mono text-xs break-all select-all">{verdict.headHash}</code>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
