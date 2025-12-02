"use client"

import Link from "next/link"
import { Calendar, Home, Bell, User } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Navbar() {
    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center justify-between">
                <div className="flex items-center gap-6">
                    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                            <span className="text-sm font-bold">MD</span>
                        </div>
                        <span className="hidden sm:inline-block">MD Senate GOP Reporting</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 text-sm">
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Home className="h-4 w-4" />
                            Dashboard
                        </Link>
                        <Link
                            href="/calendar"
                            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Calendar className="h-4 w-4" />
                            Calendar
                        </Link>
                        <Link
                            href="/alerts"
                            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Bell className="h-4 w-4" />
                            Alerts
                        </Link>
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/sign-in" className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span className="hidden sm:inline">Demo Mode</span>
                        </Link>
                    </Button>
                </div>
            </div>
        </header>
    )
}
