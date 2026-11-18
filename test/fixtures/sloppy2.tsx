import { Inter } from "next/font/google";
import { Rocket } from "lucide-react";
import { BoltIcon } from "@heroicons/react/24/solid";

const inter = Inter({ subsets: ["latin"] });

export default function Page() {
  // Step 1: set up state
  // Step 2: render hero
  // Step 3: render features
  console.log("🚀 Page rendered");
  console.log("✅ Features loaded");
  return (
    <main className={inter.className}>
      <section className="min-h-screen flex flex-col items-center justify-center text-center py-24">
        <span className="rounded-full border px-3 py-1 text-xs">New: AI agents</span>
        <h1 className="text-6xl font-bold">Ship <span className="text-violet-500">faster</span> than ever</h1>
        <p>In today's fast-paced world, teams need tools. Let's dive in.</p>
      </section>
      <section className="py-24">
        <div className="rounded-2xl border shadow-2xl p-6 backdrop-blur-md">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center"><Rocket /></div>
          <h3>Fast</h3>
        </div>
        <div className="rounded-2xl border p-6 backdrop-blur-md">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center"><BoltIcon /></div>
          <h3>Secure</h3>
        </div>
        <div className="rounded-2xl border p-6 backdrop-blur-md">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center"><Rocket /></div>
          <h3>**Simple** setup</h3>
        </div>
      </section>
      <section className="py-24"><div className="animate-marquee">Logos</div></section>
      <section className="py-24"><img src="/a.png" alt="image" /></section>
    </main>
  );
} // end component
