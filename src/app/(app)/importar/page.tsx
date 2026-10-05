import { requireCtx } from '@/modules/auth/session';
import { listImports, IMPORT_FIELDS } from '@/modules/imports/import.service';
import { db } from '@/lib/db';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { dateTime, num } from '@/lib/format';
import { ImportWizard } from './wizard';

export const metadata = { title: 'Importar' };

export default async function ImportPage() {
  const ctx = await requireCtx('lead.import');
  const [jobs, campaigns] = await Promise.all([listImports(ctx), db.campaign.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })]);
  return (
    <>
      <PageHeader title="Importador" crumb="Prospecção" subtitle="UPLOAD → MAPEAMENTO → VALIDAÇÃO → PRÉVIA → DEDUPLICAÇÃO → IMPORTAÇÃO → RELATÓRIO · CSV ou XLSX, até 20 mil linhas." />
      <ImportWizard fields={IMPORT_FIELDS} campaigns={campaigns} />
      <Card title="Histórico de importações" pad={false} className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Arquivo</Th>
              <Th>Status</Th>
              <Th className="text-right">Registros</Th>
              <Th className="text-right">Novos</Th>
              <Th className="text-right">Atualizados</Th>
              <Th className="text-right">Duplicados</Th>
              <Th className="text-right">Erros</Th>
              <Th>Data</Th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <Td className="text-muted" >Nenhuma importação ainda.</Td>
              </tr>
            )}
            {jobs.map((j) => (
              <tr key={j.id}>
                <Td>
                  <b className="font-medium">{j.fileName}</b>
                  <div className="text-xs text-muted">{j.fileType}</div>
                </Td>
                <Td>
                  <Badge tone={j.status === 'COMPLETED' ? 'green' : j.status === 'FAILED' ? 'red' : 'amber'}>{j.status}</Badge>
                </Td>
                <Td className="text-right tabular">{num(j.totalRows)}</Td>
                <Td className="text-right tabular">{num(j.newCount)}</Td>
                <Td className="text-right tabular">{num(j.updatedCount)}</Td>
                <Td className="text-right tabular">{num(j.duplicateCount)}</Td>
                <Td className="text-right tabular">{num(j.errorCount)}</Td>
                <Td className="text-xs text-muted">{dateTime(j.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
