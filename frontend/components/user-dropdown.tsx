"use client"

import Link from "next/link"
import { useUser, useClerk } from "@clerk/nextjs"
import { User, Settings, LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// If you already have shadcn Skeleton at "@/components/ui/skeleton", import that instead.
function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export const UserDropdown = () => {
    const { user, isLoaded } = useUser()
    const { signOut } = useClerk()

    const handleSignOut = async () => {
        await signOut({ redirectUrl: "/login" })
    }

    // -------- Loading skeleton (keeps layout stable) --------
    if (!isLoaded) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    {/* Keep exact same button size so navbar doesn't shift */}
                    <Button
                        variant="ghost"
                        className="relative h-10 w-10 rounded-full"
                        aria-label="Loading user menu"
                    >
                        <Avatar className="h-10 w-10">
                            <AvatarFallback>
                                <Skeleton className="h-6 w-6 rounded-full" />
                            </AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>

                {/* Optional: show a skeleton menu if clicked while loading */}
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-44" />
                        </div>
                    </DropdownMenuLabel>

                    <DropdownMenuSeparator />

                    <div className="px-2 py-1.5 space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>

                    <DropdownMenuSeparator />

                    <div className="px-2 py-1.5">
                        <Skeleton className="h-8 w-full" />
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        )
    }

    // If loaded but no user (signed out), still render stable UI
    if ( ! user ) {
        return (
            <Button asChild variant="ghost" className="relative h-10 px-3">
                <Link href="/login">Sign in</Link>
            </Button>
        )
    }

    const primaryEmail = user.primaryEmailAddress?.emailAddress ?? ""
    const fullName = user.fullName ?? "User"
    const initials =
        user.firstName && user.lastName
            ? `${user.firstName[0]}${user.lastName[0]}`
            : user.firstName?.[0] ?? "U"

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full" aria-label="User menu">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={user.imageUrl} alt={fullName} />
                        <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{fullName}</p>
                        <p className="text-xs leading-none text-muted-foreground">{primaryEmail}</p>
                    </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                    <Link href="/user">
                        <User className="mr-2 h-4 w-4" />
                        Account
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                    <Link href="/user#settings">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
