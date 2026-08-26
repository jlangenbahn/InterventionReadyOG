/**
 * Import this module before any generateClient() or Authenticator usage.
 * ES module evaluation order is the only reliable way to configure Amplify
 * before App.jsx and lib files create Data clients.
 *
 * Identity-pool guest credentials are not needed for this app (AppSync uses
 * the Cognito user pool). Leaving the pool in client config makes Amplify
 * call GetId as a guest, which returns 400 and can block catalog loads.
 */
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
const auth =
  outputs?.auth && typeof outputs.auth === 'object' ? { ...outputs.auth } : null
if (auth) {
  delete auth.identity_pool_id
  auth.unauthenticated_identities_enabled = false
}

Amplify.configure(auth ? { ...outputs, auth } : outputs)
