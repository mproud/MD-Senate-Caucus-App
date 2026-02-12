import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatLongDate } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { Bill, BillEvent } from "@prisma/client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

type BillEventExtended = BillEvent & {
    bill?: Bill
}

interface EventsResponse {
    events: BillEvent[]
}

export const TabEventHistory = () => {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(true)
    const [events, setEvents] = useState<BillEventExtended[]>([])

    const userRole = (user?.publicMetadata as { role?: string })?.role
    const isAdmin = userRole === "admin" || userRole === "super_admin"

    useEffect(() => {
        if (isLoaded && user && isAdmin) {
            fetchEvents()
        }
    }, [isLoaded, user, isAdmin])

    const fetchEvents = async () => {
        try {
            const response = await fetch("/api/admin/events")
            if (response.ok) {
                const data: EventsResponse = await response.json()
                setEvents(data.events || [])
            }
        } catch (error) {
            console.error("Failed to fetch events:", error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Recent Events</CardTitle>
                    <CardDescription>A list of recently triggered events</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-muted-foreground">Loading...</p>
                    ) : events.length === 0 ? (
                        <p className="text-muted-foreground">No recent events</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Bill ID</TableHead>
                                    <TableHead>Event Type</TableHead>
                                    <TableHead>Time</TableHead>
                                    <TableHead>Chamber</TableHead>
                                    <TableHead>Summary</TableHead>
                                    <TableHead>Alert Status</TableHead>
                                    <TableHead>Alert Processed At</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {events.map((event) => {
                                    return (
                                        <TableRow key={event.id}>
                                            <TableCell>
                                                {event.billId}
                                                { event.bill && (
                                                    <>
                                                        {" "}(
                                                            <Link href={`/bills/${event.bill?.billNumber}?activeTab=votes`} target="_blank">
                                                                {event.bill?.billNumber}
                                                            </Link>
                                                        )
                                                    </>
                                                )}</TableCell>
                                            <TableCell>{event.eventType}</TableCell>
                                            <TableCell>{formatLongDate(event.createdAt)}</TableCell>
                                            <TableCell>{event.chamber}</TableCell>
                                            <TableCell>{event.summary}</TableCell>
                                            <TableCell>{event.alertsStatus}</TableCell>
                                            <TableCell>{event.alertsProcessedAt && formatLongDate(event.alertsProcessedAt)}</TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </>
    )
}