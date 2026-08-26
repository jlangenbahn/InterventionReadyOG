/**
 * Shared Amplify Data pagination helper.
 * AppSync list() calls return at most `limit` rows plus a nextToken.
 */

export async function listAll(model, options = {}) {
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await model.list({
      limit: 1000,
      nextToken,
      ...options,
    })
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join(', '))
    }
    items.push(...(data ?? []))
    nextToken = token
  } while (nextToken)
  return items
}
