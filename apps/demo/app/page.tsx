"use client";

import { PromptPanel, RpaProvider } from "@giselles/rpa-sdk/react";
import { useState } from "react";

function DemoForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("memo");
  const [publish, setPublish] = useState(false);

  return (
    <main className="min-h-screen p-6 text-slate-100 sm:p-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">AI RPA MVP</p>
        <h1 className="mt-2 text-3xl font-semibold">Form Autofill Prototype</h1>
        <p className="mt-3 text-sm text-slate-300/90">
          Use the prompt panel at bottom-right to generate an action plan, then apply it.
        </p>

        <form className="mt-8 space-y-5" onSubmit={(event) => event.preventDefault()}>
          <div>
            <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-100">
              Title
            </label>
            <input
              id="title"
              name="title"
              data-rpa-id="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Enter title"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="body" className="mb-2 block text-sm font-medium text-slate-100">
              Body
            </label>
            <textarea
              id="body"
              name="body"
              data-rpa-id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Enter body"
              rows={8}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="category" className="mb-2 block text-sm font-medium text-slate-100">
              Category
            </label>
            <select
              id="category"
              name="category"
              data-rpa-id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            >
              <option value="memo">Memo</option>
              <option value="blog">Blog Post</option>
              <option value="report">Report</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              name="publish"
              data-rpa-id="publish"
              checked={publish}
              onChange={(event) => setPublish(event.target.checked)}
              className="h-4 w-4 rounded border-slate-500 bg-slate-950 text-cyan-400"
            />
            Publish immediately
          </label>
        </form>

        <div className="mt-8 rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Current State</p>
          <pre className="mt-2 overflow-auto text-xs text-slate-200">{JSON.stringify({ title, body, category, publish }, null, 2)}</pre>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <RpaProvider endpoint="/api/rpa">
      <DemoForm />
      <PromptPanel
        defaultInstruction="Fill title and body with a concise summary of the provided document."
      />
    </RpaProvider>
  );
}
