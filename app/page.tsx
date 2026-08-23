export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
            Band on the Map
          </h1>
          <p className="text-lg text-slate-700">
            Find live music where you&apos;re going.
          </p>
        </header>

        <section
          aria-label="Search preview"
          className="grid gap-4 rounded border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Country
            <select className="h-11 rounded border border-slate-300 bg-white px-3 text-base font-normal text-slate-950">
              <option>Portugal</option>
              <option>Croatia</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-800">
            From date
            <input
              type="date"
              className="h-11 rounded border border-slate-300 bg-white px-3 text-base font-normal text-slate-950"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-800">
            To date
            <input
              type="date"
              className="h-11 rounded border border-slate-300 bg-white px-3 text-base font-normal text-slate-950"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Type
            <select className="h-11 rounded border border-slate-300 bg-white px-3 text-base font-normal text-slate-950">
              <option>All</option>
              <option>Gigs</option>
              <option>Festivals</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Genre
            <select className="h-11 rounded border border-slate-300 bg-white px-3 text-base font-normal text-slate-950">
              <option>Any</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Price
            <select className="h-11 rounded border border-slate-300 bg-white px-3 text-base font-normal text-slate-950">
              <option>Any</option>
              <option>Free</option>
              <option>Under €20</option>
              <option>Under €50</option>
            </select>
          </label>
        </section>

        <section
          aria-label="Map placeholder"
          className="flex min-h-[360px] items-center justify-center rounded border border-dashed border-slate-300 bg-white p-6 text-center text-lg font-medium text-slate-600"
        >
          Interactive map coming next
        </section>
      </div>
    </main>
  );
}
