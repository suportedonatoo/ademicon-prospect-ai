// O sistema roda em stacksolution.com.br/secret-ademicon (a raiz do domínio é o site da Stack).
// Link, router e redirect() do Next já somam o prefixo; URLs montadas à mão (fetch, <a>, window.location) usam withBase.
export const BASE_PATH = '/secret-ademicon';

export const withBase = (path: string) =>
  path.startsWith('/') && !path.startsWith('//') && path !== BASE_PATH && !path.startsWith(`${BASE_PATH}/`) ? `${BASE_PATH}${path}` : path;

/** APP_URL sempre com o prefixo (links enviados por WhatsApp, e-mail, agenda etc.). */
export const appUrlWithBase = (url: string) => {
  const u = url.replace(/\/+$/, '');
  return u.endsWith(BASE_PATH) ? u : `${u}${BASE_PATH}`;
};
