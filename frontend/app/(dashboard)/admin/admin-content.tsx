"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Trash2, Mail, Shield, Clock, Users, ShieldAlert, Settings, RotateCcw, Save, ListTodo, UserCheck } from "lucide-react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import clsx from "clsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { sessionCodeOptions } from "@/lib/config"

interface User {
    id: string
    emailAddresses: { emailAddress: string }[]
    firstName: string | null
    lastName: string | null
    imageUrl: string
    createdAt: number
    lastSignInAt: number | null
    publicMetadata: { role?: string }
}

interface Invitation {
    id: string
    emailAddress: string
    status: string
    createdAt: number
    publicMetadata: { role?: string }
}

interface WaitlistEntry {
    id: string
    emailAddress: string
    status: string
    createdAt: number
}

interface UsersResponse {
    users: User[]
    isSuperAdmin: boolean
}

interface InvitationsResponse {
    invitations: Invitation[]
}

interface WaitlistResponse {
    entries: WaitlistEntry[]
}

export interface GlobalSettings {
    activeSessionCode: string
    sessionYear: number
    sessionType: string
}

interface SettingsResponse {
    settings: GlobalSettings
}

export const AdminContent = () => {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const [users, setUsers] = useState<User[]>([])
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [waitlistLoading, setWaitlistLoading] = useState(true)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState("member")
    const [isInviting, setIsInviting] = useState(false)
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
    const [isSuperAdmin, setIsSuperAdmin] = useState(false)

   	const [approveDialogOpen, setApproveDialogOpen] = useState(false)
	const [selectedWaitlistEntry, setSelectedWaitlistEntry] = useState<WaitlistEntry | null>(null)
	const [approveRole, setApproveRole] = useState("member")
	const [isApproving, setIsApproving] = useState(false)

    const [settings, setSettings] = useState<GlobalSettings | null>(null)
    const [settingsLoading, setSettingsLoading] = useState(true)
    const [settingsSaving, setSettingsSaving] = useState(false)
    const [settingsChanged, setSettingsChanged] = useState(false)

    const userRole = (user?.publicMetadata as { role?: string })?.role
    const isAdmin = userRole === "admin" || userRole === "super_admin"

    useEffect(() => {
        if (isLoaded && (!user || !isAdmin)) {
            router.push("/")
        }
    }, [isLoaded, user, isAdmin, router])

    useEffect(() => {
        if (isLoaded && user && isAdmin) {
            fetchUsers()
            fetchInvitations()
            fetchWaitlist()
            fetchSettings()
        }
    }, [isLoaded, user, isAdmin])

    const fetchUsers = async () => {
        try {
            const response = await fetch("/api/admin/users")
            if (response.ok) {
                const data: UsersResponse = await response.json()
                setUsers(data.users || [])
                setIsSuperAdmin(data.isSuperAdmin || false)
            }
        } catch (error) {
            console.error("Failed to fetch users:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const fetchInvitations = async () => {
        try {
            const response = await fetch("/api/admin/invitations")
            if (response.ok) {
                const data: InvitationsResponse = await response.json()
                setInvitations(data.invitations || [])
            }
        } catch (error) {
            console.error("Failed to fetch invitations:", error)
        }
    }

    const fetchWaitlist = async () => {
        try {
            const response = await fetch("/api/admin/waitlist")
            if (response.ok) {
                const data: WaitlistResponse = await response.json()
                setWaitlistEntries(data.entries || [])
            }
        } catch (error) {
            console.error("Failed to fetch waitlist:", error)
        } finally {
            setWaitlistLoading(false)
        }
    }

    const fetchSettings = async () => {
        try {
            const response = await fetch("/api/admin/settings")
            if (response.ok) {
                const data: SettingsResponse = await response.json()
                console.log('Settings', { data })
                setSettings(data.settings)
            }
        } catch (error) {
            console.error("Failed to fetch settings:", error)
        } finally {
            setSettingsLoading(false)
        }
    }

    const handleSettingsChange = (key: keyof GlobalSettings, value: string | number | boolean) => {
        if (!settings) return
        setSettings({ ...settings, [key]: value })
        setSettingsChanged(true)
    }

    const handleSessionCodeChange = (code: string) => {
        const session = sessionCodeOptions.find((s) => s.code === code)
        if (session && settings) {
            setSettings({
                ...settings,
                activeSessionCode: session.code,
                sessionYear: session.year,
                sessionType: session.type,
            })
            setSettingsChanged(true)
        }
    }

    const handleSaveSettings = async () => {
        if (!settings) return
        setSettingsSaving(true)
        try {
            const response = await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            })
            if (response.ok) {
                setSettingsChanged(false)
            }
        } catch (error) {
            console.error("Failed to save settings:", error)
        } finally {
            setSettingsSaving(false)
        }
    }

    // This isn't used
    const handleResetSettings = async () => {
        setSettingsSaving(true)
        try {
            const response = await fetch("/api/admin/settings", {
                method: "DELETE",
            })
            if (response.ok) {
                const data: SettingsResponse = await response.json()
                setSettings(data.settings)
                setSettingsChanged(false)
            }
        } catch (error) {
            console.error("Failed to reset settings:", error)
        } finally {
            setSettingsSaving(false)
        }
    }

    const handleInviteUser = async () => {
        if (!inviteEmail) return

        setIsInviting(true)
        try {
            const response = await fetch("/api/admin/invitations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            })

            if (response.ok) {
                setInviteEmail("")
                setInviteRole("member")
                setInviteDialogOpen(false)
                fetchInvitations()
            }
        } catch (error) {
            console.error("Failed to invite user:", error)
        } finally {
            setIsInviting(false)
        }
    }

    const handleDeleteUser = async (userId: string) => {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: "DELETE",
            })

            if (response.ok) {
                fetchUsers()
            }
        } catch (error) {
            console.error("Failed to delete user:", error)
        }
    }

    const handleRevokeInvitation = async (invitationId: string) => {
        try {
            const response = await fetch(`/api/admin/invitations/${invitationId}`, {
                method: "DELETE",
            })

            if (response.ok) {
                fetchInvitations()
            }
        } catch (error) {
            console.error("Failed to revoke invitation:", error)
        }
    }

    const handleApproveWaitlistEntry = async () => {
        if (!selectedWaitlistEntry) return

        setIsApproving(true)
        try {
            const response = await fetch(`/api/admin/waitlist/${selectedWaitlistEntry.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: approveRole }),
            })

            if (response.ok) {
                setApproveDialogOpen(false)
                setSelectedWaitlistEntry(null)
                setApproveRole("member")
                fetchWaitlist()
                fetchInvitations()
            }
        } catch (error) {
            console.error("Failed to approve waitlist entry:", error)
        } finally {
            setIsApproving(false)
        }
    }

    const handleRemoveWaitlistEntry = async (entryId: string) => {
        try {
            const response = await fetch(`/api/admin/waitlist/${entryId}`, {
                method: "DELETE",
            })

            if (response.ok) {
                fetchWaitlist()
            }
        } catch (error) {
            console.error("Failed to remove waitlist entry:", error)
        }
    }

    const handleUpdateRole = async (userId: string, newRole: string) => {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: newRole }),
            })

            if (response.ok) {
                fetchUsers()
            }
        } catch (error) {
            console.error("Failed to update role:", error)
        }
    }

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        })
    }

    // Kept this in here, but it's not used. Use to return color class for role badge
    const getRoleBadgeVariant = (role: string | undefined) => {
        switch (role) {
            case "super_admin":
                return "default"
            case "admin":
                return "destructive"
            case "editor":
                return "secondary"
            default:
                return "outline"
        }
    }

    const getWaitlistStatusVariant = (status: string) => {
        switch (status) {
            case "pending":
                return "outline"
            case "invited":
                return "secondary"
            case "completed":
                return "default"
            default:
                return "outline"
        }
    }

    if (!isLoaded || !user || !isAdmin) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Checking permissions...</p>
            </div>
        )
    }

    const pendingWaitlistCount = waitlistEntries.filter((e) => e.status === "pending").length

    return (
        <>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
                    <p className="text-muted-foreground">Manage users, invitations, and global settings</p>
                </div>
            </div>

            <Tabs defaultValue="users" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="users" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Users
                    </TabsTrigger>
                    <TabsTrigger value="waitlist" className="flex items-center gap-2">
                        <ListTodo className="h-4 w-4" />
                        Waitlist
                        {pendingWaitlistCount > 0 && (
                            <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                                {pendingWaitlistCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Settings
                    </TabsTrigger>
                </TabsList>

                {/* Users Tab */}
                <TabsContent value="users" className="space-y-6">
                    <div className="flex justify-end">
                        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Invite User
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Invite New User</DialogTitle>
                                    <DialogDescription>
                                        Send an invitation email to add a new user to your organization.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="user@example.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="role">Role</Label>
                                        <Select value={inviteRole} onValueChange={setInviteRole}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="member">Member</SelectItem>
                                                {/* <SelectItem value="editor">Editor</SelectItem> */}
                                                <SelectItem value="admin">Admin</SelectItem>
                                                {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleInviteUser} disabled={isInviting || !inviteEmail}>
                                        {isInviting ? "Sending..." : "Send Invitation"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div
                        className={clsx(
                            "grid gap-6",
                            isSuperAdmin ? "md:grid-cols-4" : "md:grid-cols-3"
                        )}
                    >
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{users.length}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending Invitations</CardTitle>
                                <Mail className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{invitations.filter((i) => i.status === "pending").length}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Admins</CardTitle>
                                <Shield className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {users.filter((u) => u.publicMetadata?.role === "admin").length}
                                </div>
                            </CardContent>
                        </Card>
                        {isSuperAdmin && (
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
                                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {users.filter((u) => u.publicMetadata?.role === "super_admin").length}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Active Users</CardTitle>
                            <CardDescription>Manage existing users and their roles</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="text-center py-8 text-muted-foreground">Loading users...</div>
                            ) : users.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">No users found</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Joined</TableHead>
                                            <TableHead>Last Sign In</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((u) => (
                                            <TableRow key={u.id}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        {u.imageUrl && (
                                                            <img src={u.imageUrl || "/placeholder.svg"} alt="" className="h-8 w-8 rounded-full" />
                                                        )}
                                                        <span>
                                                            {u.firstName || u.lastName
                                                                ? `${u.firstName || ""} ${u.lastName || ""}`.trim()
                                                                : "No name"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{u.emailAddresses[0]?.emailAddress}</TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={u.publicMetadata?.role || "member"}
                                                        onValueChange={(value) => handleUpdateRole(u.id, value)}
                                                    >
                                                        <SelectTrigger className="w-32 capitalize">
                                                            {u.publicMetadata?.role?.replace("_", " ") || "member"}
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="member">Member</SelectItem>
                                                            {/* <SelectItem value="editor">Editor</SelectItem> */}
                                                            <SelectItem value="admin">Admin</SelectItem>
                                                            {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>{formatDate(u.createdAt)}</TableCell>
                                                <TableCell>{u.lastSignInAt ? formatDate(u.lastSignInAt) : "Never"}</TableCell>
                                                <TableCell className="text-right">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="text-destructive">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Remove User</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Are you sure you want to remove this user? This action cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => handleDeleteUser(u.id)}
                                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                >
                                                                    Remove
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Invitations</CardTitle>
                            <CardDescription>Invitations that have been sent but not yet accepted</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {invitations.filter((i) => i.status === "pending").length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">No pending invitations</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Sent</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invitations
                                            .filter((i) => i.status === "pending")
                                            .map((invitation) => (
                                                <TableRow key={invitation.id}>
                                                    <TableCell className="font-medium">{invitation.emailAddress}</TableCell>
                                                    <TableCell className="capitalize">
                                                        {invitation.publicMetadata?.role?.replace("_", " ") || "member"}
                                                    </TableCell>
                                                    <TableCell>{formatDate(invitation.createdAt)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="capitalize">
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            {invitation.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive"
                                                            onClick={() => handleRevokeInvitation(invitation.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Waitlist Tab */}
                <TabsContent value="waitlist" className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {waitlistEntries.filter((e) => e.status === "pending").length}
                                </div>
                                <p className="text-xs text-muted-foreground">Awaiting approval</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Invited</CardTitle>
                                <Mail className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {waitlistEntries.filter((e) => e.status === "invited").length}
                                </div>
                                <p className="text-xs text-muted-foreground">Invitation sent</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total on Waitlist</CardTitle>
                                <ListTodo className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{waitlistEntries.length}</div>
                                <p className="text-xs text-muted-foreground">All time</p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Waitlist Entries</CardTitle>
                            <CardDescription>Review and manage users who have requested access to the application</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {waitlistLoading ? (
                                <div className="text-center py-8 text-muted-foreground">Loading waitlist...</div>
                            ) : waitlistEntries.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">No waitlist entries</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Requested</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {waitlistEntries.map((entry) => (
                                            <TableRow key={entry.id}>
                                                <TableCell className="font-medium">{entry.emailAddress}</TableCell>
                                                <TableCell>{formatDate(entry.createdAt)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={getWaitlistStatusVariant(entry.status)} className="capitalize">
                                                        {entry.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {entry.status === "pending" && (
                                                            <>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setSelectedWaitlistEntry(entry)
                                                                        setApproveDialogOpen(true)
                                                                    }}
                                                                >
                                                                    <UserCheck className="h-4 w-4 mr-1" />
                                                                    Grant Access
                                                                </Button>
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="ghost" size="sm" className="text-destructive">
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Remove from Waitlist</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Are you sure you want to remove {entry.emailAddress} from the waitlist? They
                                                                                will need to sign up again to request access.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction
                                                                                onClick={() => handleRemoveWaitlistEntry(entry.id)}
                                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                            >
                                                                                Remove
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Approve Dialog */}
                    <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Grant Access</DialogTitle>
                                <DialogDescription>
                                    Send an invitation to {selectedWaitlistEntry?.emailAddress} to join the application.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="approveRole">Assign Role</Label>
                                    <Select value={approveRole} onValueChange={setApproveRole}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="member">Member</SelectItem>
                                            {/* <SelectItem value="editor">Editor</SelectItem> */}
                                            <SelectItem value="admin">Admin</SelectItem>
                                            {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleApproveWaitlistEntry} disabled={isApproving}>
                                    {isApproving ? "Sending..." : "Send Invitation"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-6">
                    {settingsLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Loading settings...</div>
                    ) : settings ? (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Session Settings</CardTitle>
                                    <CardDescription>Configure the active legislative session for data fetching</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="sessionCode">Active Session Code</Label>
                                            <Select value={settings.activeSessionCode} onValueChange={handleSessionCodeChange}>
                                                <SelectTrigger id="sessionCode">
                                                    <SelectValue placeholder="Select session" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {sessionCodeOptions.map((session) => (
                                                        <SelectItem key={session.code} value={session.code}>
                                                            {session.code} - {session.type}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-sm text-muted-foreground">
                                                This determines which session's data is fetched from the MGA website
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Current Session Info</Label>
                                            <div className="flex gap-2">
                                                <Badge variant="outline">{settings.sessionYear}</Badge>
                                                <Badge variant="secondary">{settings.sessionType}</Badge>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div>
                                <Button onClick={handleSaveSettings} disabled={settingsSaving || !settingsChanged}>
                                    <Save className="h-4 w-4 mr-2" />
                                    {settingsSaving ? "Saving..." : "Save Changes"}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">Failed to load settings</div>
                    )}
                </TabsContent>
            </Tabs>
        </>
    )
}
