/**
 * Lazy Amplify Data client (user-pool auth). Import this instead of generateClient() in UI code.
 */
import '../configureAmplify.js'
import { generateClient } from 'aws-amplify/data'

let dataClient

/** Create the Data client on first use, after Amplify.configure() has run. */
export function getDataClient() {
  if (!dataClient) {
    dataClient = generateClient({ authMode: 'userPool' })
  }
  return dataClient
}

export const client = new Proxy(
  {},
  {
    get(_target, property) {
      const actual = getDataClient()
      const value = actual[property]
      return typeof value === 'function' ? value.bind(actual) : value
    },
  },
)
