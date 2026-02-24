import { init } from 'iii-sdk'

const engineWsUrl = process.env.III_BRIDGE_URL ?? 'ws://localhost:49134'

export const iii = init(engineWsUrl, {
  otel: {
    enabled: true,
    serviceName: 'tailclaude',
    metricsEnabled: true,
    reconnectionConfig: {
      maxRetries: 10,
    },
  },
})
