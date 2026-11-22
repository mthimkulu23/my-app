export type AppUser = {
  id: string;
  displayName: string;
  email: string;
  role: 'customer' | 'agent';
};

export type AgentDirectoryEntry = {
  id: string;
  displayName: string;
  online: boolean;
  lastSeenAt: string | null;
};

export type AgentShiftEntry = {
  id: string;
  agentId: string;
  agentName: string;
  email: string;
  loginAt: string;
  logoutAt: string | null;
  durationMinutes: number;
  status: 'active' | 'completed';
};

export type ConversationParticipant = {
  id?: string;
  _id?: string;
  displayName: string;
};

export type ConversationSummary = {
  id: string;
  participants: ConversationParticipant[];
  channel: 'internal' | 'whatsapp';
  contactName?: string | null;
  contactAddress?: string | null;
  lastMessageText: string;
  lastMessageAt: string | null;
};

export type ChatMessage = {
  id: string;
  senderId: string | null;
  senderName: string;
  direction: 'internal' | 'inbound' | 'outbound';
  text: string;
  createdAt: string;
};

export type CallLogEntry = {
  id: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  mode: 'live' | 'demo';
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
};

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL in the app .env file to connect to the API.');

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Could not reach the API. Check the server and EXPO_PUBLIC_API_URL.');
  }

  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}