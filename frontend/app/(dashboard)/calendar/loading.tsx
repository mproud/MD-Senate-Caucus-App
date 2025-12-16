export default function Loading() {
    return (
        <div className="space-y-6 px-4">
            <div className="flex items-center justify-between gap-3 border-b pb-4">
                <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
                <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
            </div>

            <div className="h-24 animate-pulse rounded-md border bg-muted/40" />
            <div className="h-[420px] animate-pulse rounded-md border bg-muted/40" />
        </div>
    )
}