import { useEffect, useState } from 'react'
import { Authenticator } from '@aws-amplify/ui-react'
import { generateClient } from 'aws-amplify/data'
import './App.css'

const client = generateClient()

function ConceptBrowser({ user, signOut }) {
  const [concepts, setConcepts] = useState([])
  const [status, setStatus] = useState('Loading concepts…')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadConcepts() {
      try {
        const all = []
        let nextToken
        do {
          const { data, errors, nextToken: token } = await client.models.Concept.list({
            limit: 200,
            nextToken,
          })
          if (errors?.length) {
            throw new Error(errors.map((e) => e.message).join(', '))
          }
          all.push(...(data ?? []))
          nextToken = token
        } while (nextToken)

        if (!cancelled) {
          all.sort((a, b) => String(a.concept ?? '').localeCompare(String(b.concept ?? '')))
          setConcepts(all)
          setStatus(`Loaded ${all.length} concepts from migrated data`)
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Failed to load concepts')
        }
      }
    }

    loadConcepts()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = concepts.filter((item) => {
    const haystack = [item.concept, item.category, item.subcategory, item.level]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">InterventionReadyOG</p>
          <h1>Concepts</h1>
          <p className="status">{status}</p>
        </div>
        <div className="user-panel">
          <span>{user?.signInDetails?.loginId ?? user?.username}</span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <label className="search">
        <span className="sr-only">Filter concepts</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by concept, category, level…"
        />
      </label>

      <ul className="concept-list">
        {filtered.map((item) => (
          <li key={item.id}>
            <strong>{item.concept}</strong>
            <span>
              {[item.level && `Level ${item.level}`, item.category, item.subcategory]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default function App() {
  return (
    <Authenticator loginMechanisms={['email']}>
      {({ signOut, user }) => <ConceptBrowser user={user} signOut={signOut} />}
    </Authenticator>
  )
}
