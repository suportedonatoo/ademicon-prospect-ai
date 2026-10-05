import { authed, query } from '@/lib/api';
import { parseSpec, runReport } from '@/modules/reports/report.service';

/** GET /api/v1/reports?entity=LEADS|OPPORTUNITIES&columns=a,b&groupBy=&period=&<filtros> — relatório (até 500 linhas). */
export const GET = authed({}, async ({ req, ctx }) => runReport(ctx, parseSpec(query(req))));
