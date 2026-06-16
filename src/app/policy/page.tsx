import fs from 'fs/promises';
import path from 'path';
import { requirePageUser } from '@/lib/auth/admin';

export default async function PolicyPage() {
  await requirePageUser();
  const file = path.join(process.cwd(), 'docs', 'KYC_DOCUMENT_MATRIX_REVIEW.md');
  const markdown = await fs.readFile(file, 'utf8');
  return (
    <div className="grid">
      <section className="hero">
        <div>
          <h1>KYC Policy Review</h1>
          <p>Non-technical review copy for KYC/Compliance teammates. Use this page to check whether mandatory conditions are complete.</p>
        </div>
        <a className="button" href="/">Back to Cases</a>
      </section>
      <article className="card policy-doc">
        {markdown.split('\n').map((line, index) => {
          if (line.startsWith('# ')) return <h1 key={index}>{line.replace('# ', '')}</h1>;
          if (line.startsWith('## ')) return <h2 key={index}>{line.replace('## ', '')}</h2>;
          if (line.startsWith('### ')) return <h3 key={index}>{line.replace('### ', '')}</h3>;
          if (line.startsWith('- ')) return <p key={index}>• {line.replace('- ', '')}</p>;
          if (line.trim().startsWith('|')) return <pre key={index} className="policy-line">{line}</pre>;
          if (!line.trim()) return <br key={index} />;
          return <p key={index}>{line}</p>;
        })}
      </article>
    </div>
  );
}
