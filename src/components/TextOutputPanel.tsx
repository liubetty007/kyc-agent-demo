export function TextOutputPanel({ title, text, empty }: { title: string; text?: string; empty: string }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {text ? <pre>{text}</pre> : <p>{empty}</p>}
    </div>
  );
}
