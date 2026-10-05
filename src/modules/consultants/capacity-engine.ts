// CAPACITY INTELLIGENCE — carga do consultor frente à capacidade configurada (motor puro).

export type CapacityState = 'NORMAL' | 'ALTA' | 'CRITICA' | 'INDISPONIVEL';

export interface WorkingHours {
  days?: number[]; // 0 = domingo … 6 = sábado
  start?: number; // hora local 0–23
  end?: number;
}

export interface CapacityInput {
  maxOpenLeads: number;
  maxOpenOpportunities: number;
  activeLeads: number;
  activeOpportunities: number;
  available: boolean;
  active: boolean;
  workingHours?: WorkingHours | null;
}

export interface CapacityResult {
  state: CapacityState;
  load: number; // 0–100+ (% da capacidade mais pressionada)
  leadLoad: number;
  opportunityLoad: number;
  withinWorkingHours: boolean;
  reason: string;
}

export function withinWorkingHours(wh: WorkingHours | null | undefined, now = new Date()): boolean {
  if (!wh || (wh.days == null && wh.start == null)) return true;
  if (wh.days && wh.days.length && !wh.days.includes(now.getDay())) return false;
  const h = now.getHours();
  if (wh.start != null && wh.end != null && !(h >= wh.start && h < wh.end)) return false;
  return true;
}

export function assessCapacity(c: CapacityInput, now = new Date(), thresholds = { high: 80, critical: 100 }): CapacityResult {
  const leadLoad = c.maxOpenLeads > 0 ? Math.round((c.activeLeads / c.maxOpenLeads) * 100) : 0;
  const opportunityLoad = c.maxOpenOpportunities > 0 ? Math.round((c.activeOpportunities / c.maxOpenOpportunities) * 100) : 0;
  const load = Math.max(leadLoad, opportunityLoad);
  const inHours = withinWorkingHours(c.workingHours, now);
  if (!c.active || !c.available) return { state: 'INDISPONIVEL', load, leadLoad, opportunityLoad, withinWorkingHours: inHours, reason: !c.active ? 'Consultor inativo' : 'Marcado como indisponível' };
  if (load >= thresholds.critical) return { state: 'CRITICA', load, leadLoad, opportunityLoad, withinWorkingHours: inHours, reason: `Carga ${load}% (limite atingido)` };
  if (load >= thresholds.high) return { state: 'ALTA', load, leadLoad, opportunityLoad, withinWorkingHours: inHours, reason: `Carga ${load}%` };
  return { state: 'NORMAL', load, leadLoad, opportunityLoad, withinWorkingHours: inHours, reason: `Carga ${load}%` };
}

export const CAPACITY_LABEL: Record<CapacityState, string> = { NORMAL: 'Normal', ALTA: 'Alta', CRITICA: 'Crítica', INDISPONIVEL: 'Indisponível' };
