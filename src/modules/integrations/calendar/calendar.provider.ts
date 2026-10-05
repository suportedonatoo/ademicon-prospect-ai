import type { IntegrationProvider } from '../types';
import { NotImplementedIntegration } from '../types';

// CalendarProvider — reuniões, agendamentos e follow-ups (Google Calendar / Microsoft Calendar).
// Integração real exige OAuth do usuário e aprovação do app; até lá: NOT_CONFIGURED (sem simulação).

export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  attendees?: string[];
  description?: string;
}

export interface CalendarProvider extends IntegrationProvider {
  createEvent(ownerUserId: string, e: CalendarEvent): Promise<{ id: string }>;
}

class NotConfiguredCalendar implements CalendarProvider {
  category = 'crm' as const;
  mode = 'placeholder' as const;
  constructor(public key: string, public name: string) {}
  async healthCheck() {
    return { ok: false, mode: this.mode, detail: 'Não configurado: requer OAuth (escopo de calendário) e credenciais do app.' };
  }
  async createEvent(): Promise<{ id: string }> {
    throw new NotImplementedIntegration(this.name, 'createEvent');
  }
}

export const createGoogleCalendarProvider = (): CalendarProvider => new NotConfiguredCalendar('google-calendar', 'Google Calendar');
export const createMicrosoftCalendarProvider = (): CalendarProvider => new NotConfiguredCalendar('microsoft-calendar', 'Microsoft Calendar');
