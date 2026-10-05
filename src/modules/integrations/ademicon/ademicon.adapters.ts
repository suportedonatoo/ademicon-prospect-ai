import type { AdemiconSystemAdapter, HealthResult } from '../types';
import { NotImplementedIntegration } from '../types';

/**
 * Placeholders para sistemas internos (Newcon, ComercialNet).
 * NÃO há endpoints inventados e NENHUMA tentativa de acesso sem credenciais e autorização formal.
 * Cada operação só deve ser implementada a partir da documentação oficial fornecida.
 */
abstract class PlaceholderAdapter implements AdemiconSystemAdapter {
  abstract key: string;
  abstract name: string;
  category = 'crm' as const;
  mode = 'placeholder' as const;

  async healthCheck(): Promise<HealthResult> {
    return { ok: false, mode: 'placeholder', detail: 'Aguardando documentação oficial e credenciais autorizadas.' };
  }
  async connect(): Promise<void> {
    throw new NotImplementedIntegration(this.name, 'connect');
  }
  async getLead(): Promise<unknown> {
    throw new NotImplementedIntegration(this.name, 'getLead');
  }
  async syncLead(): Promise<unknown> {
    throw new NotImplementedIntegration(this.name, 'syncLead');
  }
  async getProduct(): Promise<unknown> {
    throw new NotImplementedIntegration(this.name, 'getProduct');
  }
  async getSimulation(): Promise<unknown> {
    throw new NotImplementedIntegration(this.name, 'getSimulation');
  }
}

export class NewconAdapter extends PlaceholderAdapter {
  key = 'newcon';
  name = 'Newcon';
}

export class ComercialNetAdapter extends PlaceholderAdapter {
  key = 'comercialnet';
  name = 'ComercialNet';
}

/** AdemiconProvider — fachada para os sistemas da operação (hoje só placeholders). */
export class AdemiconProvider extends PlaceholderAdapter {
  key = 'ademicon';
  name = 'Ademicon (sistemas oficiais)';
}
