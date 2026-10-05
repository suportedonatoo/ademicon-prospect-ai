import { describe, expect, it } from 'vitest';
import { classifyChannel, isGoogleSearchHost } from '@/modules/attribution/channel';
import { sourceFromSession } from '@/modules/simulators/simulator.service';
import { installmentRange, simulateByInstallment, validateInstallment } from '@/modules/simulators/simulation-engine';

describe('Simulação por parcela (Simular Plano por: Parcela)', () => {
  const cfg = { key: 'IMOVEL', label: 'Imóvel', termOptions: [120, 180, 200], minValue: 50000, maxValue: 1000000 };
  it('faixa da parcela = menor crédito no maior prazo … maior crédito no menor prazo', () => {
    expect(installmentRange(cfg, false)).toEqual({ min: 250, max: 8333.33 });
  });
  it('crédito por prazo = parcela × prazo (sem taxas inventadas) e só prazos dentro da faixa', () => {
    const r = simulateByInstallment(cfg, 4000, false, 'Aviso.');
    expect(r.mode).toBe('PARCELA');
    expect(r.options.map((o) => [o.termMonths, o.credit])).toEqual([
      [120, 480000],
      [180, 720000],
      [200, 800000],
    ]);
    expect(r.value).toBe(720000); // referência: prazo intermediário
    expect(r.options[0].basis).toBe('DIVISAO_SIMPLES');
    expect(simulateByInstallment(cfg, 8000, false, '').options.map((o) => o.termMonths)).toEqual([120]); // 180/200 passariam de R$ 1 mi
  });
  it('valida a faixa da parcela', () => {
    expect(validateInstallment(cfg, 100, false)).toMatch(/entre/);
    expect(validateInstallment(cfg, 4000, false)).toBeNull();
  });
});

describe('Canal de origem: Google pago x orgânico', () => {
  it('clique de anúncio do Google (auto-tagging) é pago, mesmo vindo da busca', () => {
    expect(classifyChannel({ gclid: 'abc', referrer: 'https://www.google.com.br/' })).toBe('GOOGLE_ADS');
    expect(classifyChannel({ gbraid: 'x' })).toBe('GOOGLE_ADS');
    expect(classifyChannel({ wbraid: 'y' })).toBe('GOOGLE_ADS');
  });

  it('UTM do Google: meio pago → pago; organic → orgânico', () => {
    expect(classifyChannel({ utm_source: 'google', utm_medium: 'cpc' })).toBe('GOOGLE_ADS');
    expect(classifyChannel({ utm_source: 'Google', utm_medium: 'organic' })).toBe('GOOGLE_ORGANIC');
    expect(classifyChannel({ utm_source: 'google' })).toBe('GOOGLE_ADS'); // convenção: UTM de Google vai em anúncio
  });

  it('busca do Google sem nenhum marcador de anúncio é orgânico', () => {
    expect(classifyChannel({ referrer: 'https://www.google.com/' })).toBe('GOOGLE_ORGANIC');
    expect(classifyChannel({ referrer: 'https://www.google.com.br/search?q=consorcio' })).toBe('GOOGLE_ORGANIC');
  });

  it('não confunde domínios parecidos com o Google', () => {
    expect(isGoogleSearchHost('google.meusite.com')).toBe(false);
    expect(isGoogleSearchHost('notgoogle.com')).toBe(false);
    expect(isGoogleSearchHost('www.google.com.br')).toBe(true);
    expect(classifyChannel({ referrer: 'https://google.meusite.com/' })).toBe('LANDING');
  });

  it('outros canais e acesso direto', () => {
    expect(classifyChannel({ fbclid: 'f' })).toBe('META');
    expect(classifyChannel({ utm_source: 'instagram' })).toBe('INSTAGRAM');
    expect(classifyChannel({ referrer: 'https://l.instagram.com/' })).toBe('INSTAGRAM');
    expect(classifyChannel({})).toBe('LANDING');
    expect(classifyChannel({ referrer: 'lixo' })).toBe('LANDING');
  });

  it('origem do lead usa o canal da sessão', () => {
    expect(sourceFromSession({ channel: 'GOOGLE_ORGANIC', source: 'google' }, true)).toBe('GOOGLE_ORGANIC');
    expect(sourceFromSession({ channel: 'LANDING', source: null }, true)).toBe('LANDING');
    expect(sourceFromSession({ channel: null, source: 'google' }, true)).toBe('GOOGLE_ADS'); // sessão antiga
    expect(sourceFromSession(null, false)).toBe('SIMULATOR');
  });
});
