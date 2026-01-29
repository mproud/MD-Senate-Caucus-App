"use client"

import { useState, useEffect } from "react"
import type { CalendarDay } from "@/lib/types"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, FileText, Bell, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

type FollowApiResponse = {
    alerts?: Array<{
        id: number
        alertType: string
        billId: number
        active: boolean
        bill: any
    }>
}

type FlagApiResponse = {
    bills?: Array<{
        id: number
        billNumber: string
        shortTitle: string
        chamber: string
        statusDesc: string
        crossFileExternalId?: string | null
        crossFilleBill?: string | null
        isFlagged?: boolean
        updatedAt: string
    }>
}

export const DashboardContent = () => {
    const today = new Date().toISOString().split("T")[0]

    const [senateData, setSenateData] = useState<CalendarDay | null>(null)
    const [houseData, setHouseData] = useState<CalendarDay | null>(null)

    const [ flaggedBills, setFlaggedBills ] = useState<FlagApiResponse | null>(null)
    const [ followingBills, setFollowingBills ] = useState<FollowApiResponse | null>(null)

    const [loading, setLoading] = useState(true)

    // useEffect(() => {
    //     async function fetchData() {
    //         try {
    //             const [senate, house] = await Promise.all([
    //                 fetch(`/api/calendar?chamber=SENATE&section=Second Reading&date=${today}`).then((r) => r.json()),
    //                 fetch(`/api/calendar?chamber=HOUSE&section=Second Reading&date=${today}`).then((r) => r.json()),
    //             ])
    //             setSenateData(senate)
    //             setHouseData(house)
    //         } catch (error) {
    //             console.error("Failed to fetch calendar data:", error)
    //         } finally {
    //             setLoading(false)
    //         }
    //     }
    //     fetchData()
    // }, [today])

    useEffect(() => {
        async function fetchData() {
            try {
                const [ flagBillsResponse, followingBillsResponse ] = await Promise.all([
                    fetch('/api/flag'),
                    fetch('/api/follow?view=dashboard'),
                ])

                const flagData = (await flagBillsResponse.json()) as FlagApiResponse
                const followData = (await followingBillsResponse.json()) as FollowApiResponse

                setFlaggedBills( flagData )
                setFollowingBills( followData )
            } catch ( error ) {
                console.error("Failed to fetch dashboard content.")
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [ today ])

    const senateBillCount = senateData?.items?.length || 0
    const houseBillCount = houseData?.items?.length || 0
  
    return (
        <>
            {/* <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <Calendar className="h-8 w-8 text-primary" />
                            <Badge variant="secondary">Live</Badge>
                        </div>
                        <CardTitle className="mt-4">Senate Calendar</CardTitle>
                        <CardDescription>View Second and Third Reading calendars for the Senate</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-4 w-32 mb-4" />
                        ) : (
                            senateBillCount > 0 && (
                                <p className="mb-4 text-sm text-muted-foreground">
                                    <span className="font-semibold text-foreground">{senateBillCount}</span> bills on today's calendar
                                </p>
                            )
                        )}
                        <Link href="/calendar?chamber=SENATE&section=Second%20Reading">
                            <Button className="w-full" variant="default">
                                View Senate Calendar
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <Calendar className="h-8 w-8 text-primary" />
                            <Badge variant="secondary">Live</Badge>
                        </div>
                        <CardTitle className="mt-4">House Calendar</CardTitle>
                        <CardDescription>View Second and Third Reading calendars for the House</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-4 w-32 mb-4" />
                        ) : (
                            houseBillCount > 0 && (
                                <p className="mb-4 text-sm text-muted-foreground">
                                    <span className="font-semibold text-foreground">{houseBillCount}</span> bills on today's calendar
                                </p>
                            )
                        )}
                        <Link href="/calendar?chamber=HOUSE&section=Second%20Reading">
                            <Button className="w-full" variant="default">
                                View House Calendar
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <Bell className="h-8 w-8 text-primary" />
                            <Badge variant="outline">Manage</Badge>
                        </div>
                        <CardTitle className="mt-4">Alert Rules</CardTitle>
                        <CardDescription>Set up custom alerts for bills, committees, and stages</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/alerts">
                            <Button className="w-full bg-transparent" variant="outline">
                                Manage Alerts
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div> */}

            {loading ? (
                <div className="mt-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Alert Bills</CardTitle>
                            <CardDescription>Current status of Caucus flagged bills</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="p-4 rounded-lg border">
                                        <Skeleton className="h-4 w-24 mb-2" />
                                        <Skeleton className="h-4 w-full mb-1" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                ( flaggedBills ) && (
                    <div className="mt-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Alert Bills</CardTitle>
                                <CardDescription>Current status of Caucus flagged bills</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {flaggedBills?.bills?.map((item) => (
                                        <Link
                                            key={item.id}
                                            href={`/bills/${item.billNumber}`}
                                            className="block p-4 rounded-lg border hover:bg-accent transition-colors _border-1 _border-l-4 _border-red-500"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-primary">{item.billNumber}</span>
                                                        <Badge variant="outline" className="text-xs">
                                                            {item.chamber}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-foreground line-clamp-2">{item.shortTitle}</p>
                                                    {/* {item.committee && (
                                                        <p className="text-xs text-muted-foreground mt-1">Committee: {item.committee}</p>
                                                    )} */}
                                                    <p className="mt-4">
                                                        Current Status: {item.statusDesc}<br/>
                                                        <small>Last Updated: {item.updatedAt}</small>
                                                    </p>
                                                </div>
                                                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )
            )}

            {loading ? (
                <div className="mt-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>At A Glance</CardTitle>
                            <CardDescription>Recent changes to bills you're following</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="p-4 rounded-lg border">
                                        <Skeleton className="h-4 w-24 mb-2" />
                                        <Skeleton className="h-4 w-full mb-1" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                ( followingBills ) && (
                    <div className="mt-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>At A Glance</CardTitle>
                            <CardDescription>Recent changes to bills you're following</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {followingBills?.alerts?.map((item) => (
                                        <Link
                                            key={item.id}
                                            href={`/bills/${item.bill.billNumber}`}
                                            className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-primary">{item.bill.billNumber}</span>
                                                        <Badge variant="outline" className="text-xs">
                                                            {item.bill.chamber}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-foreground line-clamp-2">{item.bill.shortTitle}</p>
                                                    {/* {item.committee && (
                                                        <p className="text-xs text-muted-foreground mt-1">Committee: {item.committee}</p>
                                                    )} */}
                                                    <p className="mt-4">
                                                        Current Status: {item.bill.statusDesc}<br/>
                                                        <small>Last Updated: {item.bill.updatedAt}</small>
                                                    </p>
                                                </div>
                                                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                                {/* <div className="mt-4 pt-4 border-t">
                                    <Link href="/calendar">
                                        <Button variant="ghost" className="w-full">
                                            View Full Calendar
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </Link>
                                </div> */}
                            </CardContent>
                        </Card>
                    </div>
                )
            )}
        </>
    )
}