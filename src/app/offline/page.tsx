export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-green-50 flex items-center justify-center p-6">
      <section className="max-w-sm rounded-2xl bg-white border border-green-100 shadow-sm p-6 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-green-600 text-white flex items-center justify-center font-bold">
          PM
        </div>
        <h1 className="text-green-900 text-xl font-semibold">Offline shell ready</h1>
        <p className="mt-2 text-sm text-gray-500">
          PowerMatix can open while offline. Attendance changes need a network connection to sync with Supabase.
        </p>
      </section>
    </main>
  );
}
