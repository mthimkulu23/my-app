export type AppUser = {
  id: string;
  displayName: string;
  email: string;
  role: 'customer' | 'agent';
};

export type OnlineAgent = {
  id: string;
  displayName: string;
  lastSeenAt: string;
};

export type ConversationParticipant = {
  id?: string;
  _id?: string;
  displayName: string;
};

export type ConversationSummary = {
  id: string;
  participants: ConversationParticipant[];
  lastMessageText: string;
  lastMessageAt: string | null;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
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