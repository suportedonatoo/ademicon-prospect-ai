// Autenticação simulada. Senhas em texto puro SOMENTE para a demo.
// Para produção: trocar por backend com hash de senha + JWT/sessão,
// e permissões vindas do servidor (ver PERMISSIONS abaixo).
import { db, ensureSeeded } from './db.js';

const SESSION_KEY = 'vela:v1:session';

// Mapa de permissões por perfil — centraliza o que cada papel pode fazer.
export const PERMISSIONS = {
  gestor: ['dashboard', 'funil', 'leads', 'distribuicao', 'equipe', 'chatbot', 'whatsapp', 'lead:assign', 'lead:move', 'demo:reset'],
  pj: ['dashboard', 'funil', 'leads', 'chatbot', 'lead:move'],
};

export function can(user, permission) {
  return !!user && (PERMISSIONS[user.role] || []).includes(permission);
}

export async function login(email, senha) {
  ensureSeeded();
  const user = db.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!user || user.senha !== senha) throw new Error('E-mail ou senha inválidos.');
  const session = { userId: user.id, at: Date.now() };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    memorySession = session;
  }
  return publicUser(user);
}

let memorySession = null;

export function currentUser() {
  let session = memorySession;
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY)) || memorySession;
  } catch {
    /* usa memória */
  }
  if (!session) return null;
  const user = db.users.find((u) => u.id === session.userId);
  return user ? publicUser(user) : null;
}

export function logout() {
  memorySession = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignora */
  }
}

function publicUser({ senha, ...rest }) {
  return rest;
}

export function listPJs() {
  return db.users.filter((u) => u.role === 'pj').map(publicUser);
}

export function userById(id) {
  const u = db.users.find((x) => x.id === id);
  return u ? publicUser(u) : null;
}

export function demoAccounts() {
  return db.users.map((u) => ({ label: u.role === 'gestor' ? 'Gestor' : u.codigo, nome: u.nome, email: u.email, senha: u.senha }));
}
