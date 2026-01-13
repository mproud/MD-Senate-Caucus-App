"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
// import type { Bill } from "@/lib/types"
import type { Bill } from "@prisma/client"
import { Button } from "./ui/button"
import { AlertTriangle, Bell, BellOff, ExternalLink } from "lucide-react"
import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"

// @TODO fix the type at some point
interface BillHeaderProps {
    bill: any
}

// @TODO this should be shared with the api. Move into the /types folder at some point
type FollowApiResponse = {
    alerts?: Array<{
        id: number
        alertType: string
        billId: number
        active: boolean
    }>
}

type FlagApiResponse = {
    isFlag: boolean
    success: boolean
}

export function BillHeader({ bill }: BillHeaderProps) {
    const mgaUrl = `https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/${bill.billNumber}?ys=${bill.sessionCode}`

    const [isFollowing, setIsFollowing] = useState(false)
    const [isFlag, setIsFlag] = useState(false)
    const [isLoadingFollow, setIsLoadingFollow] = useState(false)
    const [isLoadingFlag, setIsLoadingFlag] = useState(false)

    const { user, isLoaded } = useUser()

    const userRole = isLoaded && user ? (user.publicMetadata as { role?: string })?.role : null
    const isAdmin = userRole === "admin" || userRole === "super_admin"

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const [ followRes, flagRes ] = await Promise.all([
                    fetch(`/api/follow?billId=${bill.id}`),
                    fetch(`/api/flag?billId=${bill.id}`),
                ])

                const followData = (await followRes.json()) as FollowApiResponse
                const flagData = (await flagRes.json()) as FlagApiResponse

                const isFollowing =
                    Array.isArray(followData.alerts) &&
                    followData.alerts.some(
                        (alert: any) =>
                            alert.alertType === "BILL_STATUS" &&
                            alert.billId === bill.id &&
                            alert.active === true
                    )

                setIsFollowing(isFollowing)
                setIsFlag(flagData.isFlag ?? false)
            } catch (error) {
                console.error("Failed to fetch bill status:", error)
            }
        }

        fetchStatus()
    }, [ bill.id ])


    // Follow a bill -- @TODO add parameters for the follow (when it's out of committee, votes, etc)
    const handleFollowToggle = async () => {
        setIsLoadingFollow( true )

        try {
            if ( ! isFollowing ) {
                const response = await fetch("/api/follow", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        alertType: "BILL_STATUS",
                        billId: bill.id,                 // use numeric billId, not billNumber
                        deliveryChannel: "EMAIL",        // or whatever default you want
                        target: "self",                  // or user email / userId depending on your app
                    }),
                })

                if ( ! response.ok ) {
                    throw new Error("Failed to create follow")
                }

                setIsFollowing(true)
            } else {
                // ---- UNFOLLOW (delete alert) ----
                const response = await fetch("/api/follow", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        alertType: "BILL_STATUS",
                        billId: bill.id,
                        deliveryChannel: "EMAIL",
                        target: "self",
                    }),
                })

                if ( ! response.ok ) {
                    throw new Error("Failed to remove follow")
                }

                setIsFollowing(false)
            }
        } catch (error) {
            console.error("Failed to toggle follow:", error)
        } finally {
            setIsLoadingFollow(false)
        }
    }

    const handleFlagToggle = async () => {
        setIsLoadingFlag(true)
        try {
            const response = await fetch("/api/flag", {
                method: isFlag ? "DELETE" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    billId: bill.id,
                    billNumber: bill.billNumber,
                    action: isFlag ? "unset" : "set",
                }),
            })

            const data = (await response.json()) as FlagApiResponse
            if ( data.success ) {
                setIsFlag( data.isFlag )
            }
        } catch (error) {
            console.error("Failed to toggle flag:", error)
        } finally {
            setIsLoadingFlag(false)
        }
    }

    return (
        <Card className={isFlag ? "border-2 border-t-5 border-red-500" : ""}>
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                        <div className="flex align-top items-center gap-2 flex-wrap">
                            <p className="text-lg leading-relaxed text-pretty">{bill.billNumber}</p>
                            
                            <Badge variant="outline">{bill.chamber}</Badge>
                            
                            {bill.isEmergency && (
                                <Badge variant="destructive" className="font-semibold">
                                    EMERGENCY BILL
                                </Badge>
                            )}

                            {bill.crossFileExternalId && <Badge variant="secondary">Crossfile: {bill.crossFileExternalId}</Badge>}
                        </div>

                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                            {bill.statusDesc && (
                                <div className="text-sm">
                                    <span className="font-medium text-muted-foreground">Status:</span> <span>{bill.statusDesc}</span>
                                </div>
                            )}
                        </div>

                        <CardTitle className="text-2xl">
                            {bill.shortTitle}
                        </CardTitle>

                        <p className="mt-3 text-base leading-relaxed text-pretty">
                            {bill.sponsorDisplay}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant={isFollowing ? "default" : "outline"}
                            size="sm"
                            onClick={handleFollowToggle}
                            disabled={isLoadingFollow}
                        >
                            {isFollowing ? (
                                <>
                                    <Bell className="mr-2 h-4 w-4" />
                                    Following
                                </>
                            ) : (
                                <>
                                    <BellOff className="mr-2 h-4 w-4" />
                                    Follow
                                </>
                            )}
                        </Button>

                        { isAdmin && (
                            <Button
                                variant={isFlag ? "destructive" : "outline"}
                                size="sm"
                                onClick={handleFlagToggle}
                                disabled={isLoadingFlag}
                            >
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                {isFlag ? "Flag Set" : "Set Flag"}
                            </Button>
                        )}

                        <Button variant="outline" size="sm" asChild>
                            <a href={mgaUrl} target="_blank" rel="noopener noreferrer">
                                View on MGA <ExternalLink className="ml-2 h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>
    )
}
