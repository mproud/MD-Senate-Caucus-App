"use client"

import Link from "next/link"
import { Calendar, Home, Bell, Search, Shield, Vote } from "lucide-react"
import { UserDropdown } from "./user-dropdown"
import { ScrapeRunStatus } from "./header/scrape-run-status"
import { useUser } from "@clerk/nextjs"

export function Navbar() {
    const { user, isLoaded } = useUser()

    const userRole = isLoaded && user ? (user.publicMetadata as { role?: string })?.role : null
    const isAdmin = userRole === "admin" || userRole === "super_admin"

    // const [lastFetched, setLastFetched] = useState<Date | null>(null)
    // const [isRefreshing, setIsRefreshing] = useState(false)

    // useEffect(() => {
    //     // Set initial timestamp on mount
    //     setLastFetched(new Date())
    // }, [])

    // const handleRefresh = async () => {
    //     setIsRefreshing(true)
    //     try {
    //         // Trigger a router refresh to refetch data
    //         // router.refresh()
    //         setLastFetched(new Date())
    //     } finally {
    //         setTimeout(() => setIsRefreshing(false), 1000)
    //     }
    // }

    // const formatTimestamp = (date: Date | null) => {
    //     if (!date) return "Never"
    //     const now = new Date()
    //     const diffMs = now.getTime() - date.getTime()
    //     const diffMins = Math.floor(diffMs / 60000)

    //     if (diffMins < 1) return "Just now"
    //     if (diffMins === 1) return "1 minute ago"
    //     if (diffMins < 60) return `${diffMins} minutes ago`

    //     const diffHours = Math.floor(diffMins / 60)
    //     if (diffHours === 1) return "1 hour ago"
    //     if (diffHours < 24) return `${diffHours} hours ago`

    //     return date.toLocaleString()
    // }

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center justify-between">
                <div className="flex items-center gap-6">
                    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                            <span className="text-sm font-bold">MD</span>
                        </div>
                        <span className="hidden sm:inline-block">MD Senate Caucus Reporting</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 text-sm">
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Home className="h-4 w-4" />
                            Dashboard
                        </Link>
                        {isAdmin && (
                            <Link
                                href="/calendar?hideCalendars=first,vetoed"
                                className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <Calendar className="h-4 w-4" />
                                Calendar
                            </Link>
                        )}
                        <Link
                            href="/bills"
                            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Search className="h-4 w-4" />
                            Search Bills
                        </Link>
                        <Link
                            href="/record-vote"
                            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Vote className="h-4 w-4" />
                            Record Votes
                        </Link>
                        <Link
                            href="/alerts"
                            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Bell className="h-4 w-4" />
                            Alerts
                        </Link>
                        {isAdmin && (
                            <Link
                                href="/admin"
                                className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <Shield className="h-4 w-4" />
                                Admin
                            </Link>
                        )}
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    {/* <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Data Last Fetched:</span>
                        <span className="font-medium">{formatTimestamp(lastFetched)}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline ml-2">Refresh</span>
                    </Button> */}
                    <div className="flex space-x-2 text-xs pr-5">
                        <ScrapeRunStatus />
                    </div>
                    <UserDropdown />
                </div>
            </div>

            <div className="print-meta">
                <span className="user-name">User Name!</span>
            </div>
        </header>
    )
}
