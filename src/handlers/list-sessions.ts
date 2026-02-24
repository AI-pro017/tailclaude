import type { ApiRequest, ApiResponse } from 'iii-sdk'
import { state } from '../state.js'

type Session = {
  id: string
  model: string
  createdAt: string
  lastUsed: string
  messageCount: number
}

export const handleListSessions = async (_req: ApiRequest): Promise<ApiResponse> => {
  const sessions = await state.list<Session>({ scope: 'sessions' })

  return {
    status_code: 200,
    headers: { 'content-type': 'application/json' },
    body: {
      sessions: sessions.sort(
        (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime(),
      ),
      count: sessions.length,
    },
  }
}
