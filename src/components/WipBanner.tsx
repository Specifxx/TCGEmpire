// "Work in progress" notice shown on new sections so existing users know the
// area is freshly launched and still being filled out.
export function WipBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <p className="text-sm text-amber-100/90">
        {children ?? (
          <>
            <span className="font-semibold text-amber-200">Work in progress.</span> This section is
            brand new — we&apos;re adding more content regularly. Check back soon, or suggest a topic
            via the <a href="/contact" className="underline hover:text-white">contact form</a>.
          </>
        )}
      </p>
    </div>
  );
}
