import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listProducts } from '@/modules/products/product.service';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { ProductForm } from './product-form';

export const metadata = { title: 'Produtos' };

/** Catálogo de produtos da organização (§92): novos produtos sem alterar código. */
export default async function ProductsPage() {
  const ctx = await requireCtx('lead.read');
  const products = await listProducts(ctx);
  const canManage = can(ctx, 'settings.manage');
  return (
    <>
      <PageHeader
        crumb="Admin"
        title="Catálogo de produtos"
        subtitle="Produtos que a organização oferece. O código é usado em leads, oportunidades, simuladores e relatórios. Condições comerciais (taxas, prazos) não ficam aqui — vêm da Knowledge Base e dos simuladores com fonte oficial."
        actions={canManage && <ProductForm />}
      />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th>Código</Th>
              <Th>Categoria</Th>
              <Th>Status</Th>
              <Th className="text-right">Ordem</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <Td>
                  <b>{p.name}</b>
                  {p.description && <div className="text-xs text-muted max-w-md">{p.description}</div>}
                </Td>
                <Td>
                  <code className="text-xs">{p.key}</code>
                </Td>
                <Td className="text-sm">{p.category?.name ?? '—'}</Td>
                <Td>
                  <Badge tone={p.status === 'ACTIVE' ? 'green' : 'gray'}>{p.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Badge>
                </Td>
                <Td className="text-right tabular">{p.sortOrder}</Td>
                <Td className="text-right">
                  {canManage && (
                    <ProductForm
                      id={p.id}
                      initial={{ key: p.key, name: p.name, description: p.description ?? '', categoryKey: p.category?.key ?? '', status: p.status as 'ACTIVE' | 'INACTIVE', sortOrder: p.sortOrder }}
                    />
                  )}
                </Td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <Td className="text-sm text-muted">Nenhum produto cadastrado — o sistema usa o catálogo padrão.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
