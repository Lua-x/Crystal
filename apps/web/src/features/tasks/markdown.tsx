import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders a note as Markdown. Loaded on demand: the Markdown parser is large,
 * and many tasks have no note at all.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // Remote images would leak to third parties (and the CSP blocks them).
      disallowedElements={['img']}
      unwrapDisallowed
      components={{
        a: ({ children: text, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {text}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
