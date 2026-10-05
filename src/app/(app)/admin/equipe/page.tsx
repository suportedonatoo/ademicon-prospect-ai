import Link from 'next/link';
import { requireSuperAdmin } from '../../superadmin/guard';
import { listTeam, CSV_TEMPLATE } from '@/modules/team/team.service';
import { BACKUP_RECOMMENDED, unusableReason } from '@/modules/whatsapp/number-pool';
import { db } from '@/lib/db';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { formatPhone } from '@/lib/normalize';
import { timeAgo } from '@/lib/format';
import { MemberForm, TeamImport } from './team-forms';
import { LinkCell } from './link-cell';
import { landingUrlFor } from '@/modules/consultants/landing-link';
import { photoUrlFor } from '@/modules/consultants/photo.service';
import { PhotoPicker } from '@/components/photo-picker';

export const metadata = { title: 'Colaboradores' };

export default async function TeamPage() {
  const ctx = await requireSuperAdmin();
  const [team, pjs] = await Promise.all([
    listTeam(ctx),
    db.pJ.findMany({
      where: { organizationId: ctx.orgId, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);
  const active = team.filter((m) => m.active);
  const pjOptions = pjs.map((p) => ({
    id: p.id,
    name: `${p.code} · ${p.name}`,
  }));
  return (
    <>
      <PageHeader
        title="Colaboradores"
        crumb="Super Admin"
        subtitle="Cadastre a pessoa de uma vez: login, Instagram e de 1 a 7 números de WhatsApp. Ao salvar, ela já começa a receber leads em partes iguais e ganha o link próprio para a bio (quem chega por ele é lead dela)."
        actions={
          <div className="flex gap-2">
            <TeamImport template={CSV_TEMPLATE} />
            <MemberForm pjs={pjOptions} />
          </div>
        }
      />
      <p className="text-sm text-muted mb-3">
        {active.length} pessoa(s) ativa(s) recebendo leads · {active.filter((m) => m.whatsappNumbers.length < BACKUP_RECOMMENDED).length} sem número de backup
      </p>
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Unidade</Th>
              <Th>WhatsApp</Th>
              <Th>Link próprio (bio)</Th>
              <Th>Login</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id} className={m.active ? undefined : 'opacity-60'}>
                <Td>
                  <div className="flex items-start gap-3">
                    <PhotoPicker consultantId={m.id} name={m.name} url={photoUrlFor(m.id, m.photoKey)} />
                    <div>
                      <Link href={`/perfil?c=${m.id}`} className="font-medium hover:text-brand-600">
                        {m.name}
                      </Link>
                      <div className="text-xs text-muted">{m.email}</div>
                      {m.instagramUrl && (
                        <a href={m.instagramUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                          Instagram ↗
                        </a>
                      )}
                    </div>
                  </div>
                </Td>
                <Td>{m.pj.code}</Td>
                <Td>
                  {m.whatsappNumbers.length ? (
                    <ul className="text-xs space-y-0.5">
                      {m.whatsappNumbers.map((n, i) => (
                        <li key={n.id} className={unusableReason(n) ? 'text-warn' : undefined}>
                          {i === 0 ? '★' : '↺'} {formatPhone(n.phone)} {unusableReason(n) ? `· ${unusableReason(n)}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-warn">Sem número</span>
                  )}
                </Td>
                <Td>
                  <LinkCell consultantId={m.id} slug={m.landingSlug} url={m.landingSlug ? landingUrlFor(m.landingSlug) : null} />
                </Td>
                <Td className="text-xs">{m.user ? m.user.lastLoginAt ? `acessou ${timeAgo(m.user.lastLoginAt)}` : 'nunca acessou' : <span className="text-muted">sem login</span>}</Td>
                <Td>
                  <Badge tone={m.active ? (m.available ? 'green' : 'amber') : 'gray'} dot>
                    {m.active ? (m.available ? 'Recebendo leads' : 'Indisponível') : 'Desligado'}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    method="PATCH"
                    path={`/team/${m.id}`}
                    body={{ active: !m.active }}
                    confirm={m.active ? `Desligar ${m.name}? Para de receber leads e perde o acesso.` : undefined}
                    success={m.active ? 'Desligado.' : 'Religado — volta a receber leads em partes iguais.'}
                  >
                    {m.active ? 'Desligar' : 'Religar'}
                  </ActionButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
