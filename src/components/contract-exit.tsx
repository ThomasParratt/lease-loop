// The exit section of the contract page (docs/features/exits.md), self-contained so the page
// mounts it with one line. For an active contract: the exit plan previewed on the request's day
// with the catalogue's last known condition and usage, and the form that posts the exit. Once
// the contract has ended: its status and end day. A server component.
import type { Asset } from '@/data/schemas';
import { assetConditionSchema } from '@/data/schemas';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { ContractView } from '@/server/contracts';
import { listCustomers } from '@/server/customers';
import { db } from '@/server/db';
import { previewExit } from '@/server/exits';
import { ExitForm } from './exit-form';
import { exitRefusalValues } from './exit-refusal';
import { Card, Notice } from './ui';

type ContractExitProps = {
  contract: ContractView;
  asset: Asset | null;
  /** The request's day (the demo clock), read once by the page. */
  today: string;
  locale: Locale;
  t: Translate;
};

export async function ContractExit({ contract, asset, today, locale, t }: ContractExitProps) {
  if (contract.endedOn) {
    return (
      <Notice tone="info" title={t('exit.ended.title')}>
        {t('exit.ended.body', {
          status: t(`contract.status.${contract.status}`),
          date: formatIsoDate(contract.endedOn, locale),
        })}
      </Notice>
    );
  }
  if (contract.status !== 'active' || !asset) return null;

  const preview = await previewExit(
    db,
    { contractId: contract.id, mode: 'return', reported: asset },
    today
  );
  if (!preview.ok) {
    return (
      <Card id="exit" title={t('exit.title')}>
        <Notice tone="info">
          {t(
            `exit.refusal.${preview.reason.code}`,
            exitRefusalValues(preview.reason.params as Record<string, unknown>, t, locale)
          )}
        </Notice>
      </Card>
    );
  }
  const customers = (await listCustomers(db))
    .filter((customer) => customer.id !== contract.customerId)
    .map((customer) => ({ id: customer.id, name: customer.name }));

  return (
    <Card id="exit" title={t('exit.title')}>
      <ExitForm
        contractId={contract.id}
        locale={locale}
        endDate={contract.endDate}
        conditions={assetConditionSchema.options}
        usageUnit={asset.usage.unit}
        initial={{ condition: asset.condition, usageValue: asset.usage.value }}
        initialPreview={preview.preview}
        customers={customers}
      />
    </Card>
  );
}
