import type { Context } from 'iii-sdk'
import { state } from '../state.js'

type Session = {
  id: string
  model: string
  createdAt: string
  lastUsed: string
  messageCount: number
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000

export const handleCleanup = async (ctx: Context): Promise<void> => {
  const sessions = await state.list<Session>({ scope: 'sessions' })
  const now = Date.now()
  let removed = 0

  for (const session of sessions) {
    const age = now - new Date(session.lastUsed).getTime()
    if (age > MAX_AGE_MS) {
      await state.delete({ scope: 'sessions', key: session.id })
      removed++
    }
  }

  if (removed > 0) {
    ctx.logger.info(`Cleaned up ${removed} stale session(s)`)
  }
}
