export function Home() {
  const title = view === "saved" ? "SAVED STORIES" : "YOUR TOP STORIES";
  return (
    <main>
      <p className="eyebrow">A LITTLE CONTEXT CHANGES EVERYTHING</p>
      <h1>The news.<br/><em>With perspective.</em></h1>
      <p>Facts stay.<br/>Framing changes.</p>
      <p>Read widely. Think freely.</p>
      <p>More context. Less noise.</p>
      <span>FOX NEWS</span><span>NPR</span>
    </main>
  );
}
