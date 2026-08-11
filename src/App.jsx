import { useEffect, useState } from 'react'
import { generateClient } from 'aws-amplify/data'
import './App.css'

const client = generateClient()

function App() {
  const [todos, setTodos] = useState([])
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('Loading…')

  useEffect(() => {
    listTodos()
  }, [])

  async function listTodos() {
    try {
      const { data, errors } = await client.models.Todo.list()
      if (errors?.length) {
        setStatus(errors.map((e) => e.message).join(', '))
        return
      }
      setTodos(data ?? [])
      setStatus('Connected to Amplify Gen 2')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load todos')
    }
  }

  async function createTodo(event) {
    event.preventDefault()
    const value = content.trim()
    if (!value) return

    try {
      const { errors } = await client.models.Todo.create({ content: value })
      if (errors?.length) {
        setStatus(errors.map((e) => e.message).join(', '))
        return
      }
      setContent('')
      await listTodos()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create todo')
    }
  }

  return (
    <>
      <h1>Hello World</h1>
      <p className="read-the-docs">{status}</p>
      <form className="card" onSubmit={createTodo}>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Add a todo"
          aria-label="Todo content"
        />
        <button type="submit">Create</button>
      </form>
      <ul className="card" style={{ listStyle: 'none', padding: 0 }}>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.content}</li>
        ))}
      </ul>
    </>
  )
}

export default App
