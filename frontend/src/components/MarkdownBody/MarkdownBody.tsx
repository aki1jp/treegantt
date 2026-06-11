import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PLUGINS = [remarkGfm];

export function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={PLUGINS}>{children}</ReactMarkdown>
    </div>
  );
}
