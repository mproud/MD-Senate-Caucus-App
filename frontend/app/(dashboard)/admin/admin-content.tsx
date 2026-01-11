"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { UserPlus, Trash2, Mail, Shield, Clock, Users } from "lucide-react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

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

export const AdminContent = () => {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const [users, setUsers] = useState<User[]>([])
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState("member")
    const [isInviting, setIsInviting] = useState(false)
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

    // @TODO re-enable this after promoting one user...
    // useEffect(() => {
    //     if (isLoaded && (!user || (user.publicMetadata as { role?: string })?.role !== "admin")) {
    //         router.push("/")
    //     }
    // }, [isLoaded, user, router])

    // useEffect(() => {
    //     if (isLoaded && user && (user.publicMetadata as { role?: string })?.role === "admin") {
    //         fetchUsers()
    //         fetchInvitations()
    //     }
    // }, [isLoaded, user])

    // Override temporarily
    useEffect(() => {
        if (isLoaded && user) {
            fetchUsers()
            fetchInvitations()
        }
    }, [isLoaded, user])

    const fetchUsers = async () => {
        try {
            const response = await fetch("/api/admin/users")
            if (response.ok) {
                const data = await response.json()
                setUsers(data.users || [])
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
                const data = await response.json()
                setInvitations(data.invitations || [])
            }
        } catch (error) {
            console.error("Failed to fetch invitations:", error)
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

    const getRoleBadgeVariant = (role: string | undefined) => {
        switch (role) {
            case "admin":
                return "destructive"
            case "editor":
                return "default"
            default:
                return "secondary"
        }
    }

    if (!isLoaded || !user || (user.publicMetadata as { role?: string })?.role !== "admin") {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Checking permissions...</p>
            </div>
        )
    }

    return (
        <>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground">Invite, manage, and remove users from your organization</p>
                </div>
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
                            <DialogDescription>Send an invitation email to add a new user to your organization.</DialogDescription>
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

            <div className="grid gap-6 md:grid-cols-3 mb-6">
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
                        <div className="text-2xl font-bold">{users.filter((u) => u.publicMetadata?.role === "admin").length}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
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
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    {user.imageUrl && (
                                                        <img src={user.imageUrl || "/placeholder.svg"} alt="" className="h-8 w-8 rounded-full" />
                                                    )}
                                                    <span>
                                                        {user.firstName || user.lastName
                                                            ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                                                            : "No name"}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{user.emailAddresses[0]?.emailAddress}</TableCell>
                                            <TableCell>
                                                <Select
                                                    value={user.publicMetadata?.role || "member"}
                                                    onValueChange={(value) => handleUpdateRole(user.id, value)}
                                                >
                                                    <SelectTrigger className="w-28 capitalize">
                                                        {user.publicMetadata?.role || "member"}
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="member">Member</SelectItem>
                                                        {/* <SelectItem value="editor">Editor</SelectItem> */}
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>{formatDate(user.createdAt)}</TableCell>
                                            <TableCell>{user.lastSignInAt ? formatDate(user.lastSignInAt) : "Never"}</TableCell>
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
                                                                onClick={() => handleDeleteUser(user.id)}
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
                                                <TableCell>
                                                    <Badge className="capitalize" variant={getRoleBadgeVariant(invitation.publicMetadata?.role)}>
                                                        {invitation.publicMetadata?.role || "member"}
                                                    </Badge>
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
            </div>
        </>
    )
}
