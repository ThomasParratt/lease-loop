// POST /api/assets/:id/assessments   (no body)
// Assesses a returned asset on the request's day (the demo clock, never a date from the
// browser) and relists it: the assessment row, the passport events and the asset available at
// its second-life price, in one audited transaction (D12, D13, D61). Admin only.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { assessAsset, toAssessmentResponse, type AssessRefusal } from '@/server/second-life';
import { assessmentParamsSchema } from '@/server/second-life-schemas';

const STATUS_OF: Record<AssessRefusal['code'], number> = {
  admin_only: 403,
  asset_not_found: 404,
  asset_not_returned: 409,
  no_list_price: 422,
};

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/assets/[id]/assessments'>) => {
    const { id } = assessmentParamsSchema.parse(await params);
    const [today, actor] = await Promise.all([todayForRequest(), readActor(db)]);
    const result = await assessAsset(db, { assetId: id, actor, today });
    if (!result.ok) {
      return fail(
        STATUS_OF[result.reason.code],
        'ASSESSMENT_REFUSED',
        'The asset cannot be assessed now',
        result.reason
      );
    }
    return ok(toAssessmentResponse(result.view), { status: 201 });
  }
);
