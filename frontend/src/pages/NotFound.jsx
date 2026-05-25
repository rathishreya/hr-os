import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Button, EmptyState } from '../ui'
import { usePageTitle } from '../hooks/usePageTitle'

export default function NotFound() {
  usePageTitle('Not found')
  return (
    <EmptyState
      icon={FileQuestion}
      title="Page not found"
      description="The page you're looking for doesn't exist or was moved."
      action={<Link to="/"><Button>Back to home</Button></Link>}
    />
  )
}
