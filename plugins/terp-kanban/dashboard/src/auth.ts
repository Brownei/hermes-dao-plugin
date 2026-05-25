import { ConnectedWallet } from 'cosmes/wallet';
import { AuthChallenge, WalletUser } from './types';

const API_BASE = '/api/plugins/terp-kanban';
const SESSION_KEY = 'hermes_wallet_session';

let currentWallet: ConnectedWallet | null = null;
let sessionToken: string | null = localStorage.getItem(SESSION_KEY);

export function setCurrentWallet(wallet: ConnectedWallet | null) {
  currentWallet = wallet;
}

export function getCurrentWallet(): ConnectedWallet | null {
  return currentWallet;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (token) {
    localStorage.setItem(SESSION_KEY, token);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function isAuthenticated(): boolean {
  return !!sessionToken;
}

export async function getChallenge(): Promise<AuthChallenge> {
  const response = await fetch(`${API_BASE}/wallet/challenge`);
  if (!response.ok) {
    throw new Error('Failed to get auth challenge');
  }
  return response.json();
}

export async function signAndVerify(challenge: AuthChallenge): Promise<{ token: string }> {
  if (!currentWallet) {
    throw new Error('No wallet connected');
  }

  const signDoc = {
    chain_id: challenge.address.split('1')[0] || 'terp',
    account_number: '0',
    sequence: '0',
    fee: { gas: '0', amount: [] },
    msgs: [{ type: 'sign/MetaTx', value: { message: challenge.message } }],
    memo: '',
  };

  const signature = await currentWallet.sign([], [signDoc]);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const response = await fetch(`${API_BASE}/wallet/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: challenge.address,
      signature: signatureBase64,
      message: challenge.message,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to verify signature');
  }

  const result = await response.json();
  setSessionToken(result.token);
  return result;
}

export async function verifyWallet(): Promise<{ token: string }> {
  const challenge = await getChallenge();
  return signAndVerify(challenge);
}

export async function logout(): Promise<void> {
  if (sessionToken) {
    try {
      await fetch(`${API_BASE}/wallet/logout`, {
        method: 'POST',
        headers: { 'x-wallet-session': sessionToken },
      });
    } catch {
    }
  }
  setSessionToken(null);
}

export async function getCurrentUser(): Promise<WalletUser | null> {
  if (!sessionToken) return null;

  const response = await fetch(`${API_BASE}/wallet/me`, {
    headers: { 'x-wallet-session': sessionToken },
  });

  if (!response.ok) {
    if (response.status === 401) {
      setSessionToken(null);
      return null;
    }
    throw new Error('Failed to get current user');
  }

  return response.json();
}

export async function getWalletConfig(): Promise<{ chains: string[]; session_ttl: number }> {
  const response = await fetch(`${API_BASE}/wallet/config`);
  if (!response.ok) {
    throw new Error('Failed to get wallet config');
  }
  return response.json();
}

export function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (sessionToken) {
    headers['x-wallet-session'] = sessionToken;
  }
  return headers;
}