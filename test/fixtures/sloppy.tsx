export default function Landing() {
  const steps = ["Upload", "Preview", "Unlock"];
  return (
    <main className="bg-slate-950 text-white">
      <div className="absolute -top-40 left-1/2 h-96 w-96 rounded-full bg-purple-500 blur-3xl opacity-30" />
      <section className="py-24 text-center">
        <span className="text-xs uppercase tracking-widest text-cyan-400">Introducing Nova</span>
        <h1 className="font-serif italic text-7xl bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent">
          Unlock the power of seamless collaboration
        </h1>
        <button className="rounded-full bg-pink-500 px-6 py-3">Get started — it's free</button>
      </section>
      <section className="grid grid-cols-3 gap-6">
        <div className="rounded-2xl border p-6 shadow">🚀 Fast</div>
        <div className="rounded-2xl border p-6 shadow">⚡ Robust</div>
        <div className="rounded-2xl border p-6 shadow">✨ Effortless</div>
      </section>
      <section>
        <span>01</span><span>02</span><span>03</span>
        <div className="border-l-4 border-emerald-400 p-4">Step one</div>
        <div className="border-l-4 border-amber-400 p-4">Step two</div>
        <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
      </section>
      <section>
        <p>10k+</p><p>99.9%</p><p>50x</p>
        <p>— Sarah K.</p><p>— Mike R.</p>
      </section>
    </main>
  );
}
