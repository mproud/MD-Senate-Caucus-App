"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { User, Bell, Mail, Phone, Clock, Save, RotateCcw, Loader2, Check } from "lucide-react"

interface UserPreferences {
    userId: string
    alertDeliveryMethod: "email" | "sms" | "both"
    alertFrequency: "instant" | "daily_digest" | "weekly_digest"
    emailAddress: string
    phoneNumber: string
    digestTime: string // 24-hour format, e.g., "09:00"
    digestDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
    enabledAlertTypes: {
        billStatusChange: boolean
        committeeVote: boolean
        floorVote: boolean
        newCrossfile: boolean
        hearingScheduled: boolean
    }
}

export default function UserSettingsPage() {
    const [preferences, setPreferences] = useState<UserPreferences | null>(null)
    const [originalPreferences, setOriginalPreferences] = useState<UserPreferences | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)

    useEffect(() => {
        fetchPreferences()
    }, [])

    const fetchPreferences = async () => {
        try {
            const response = await fetch("/api/user/preferences")

            if (response.ok) {
                const rawPreferences = (await response.json()) as UserPreferences

                setPreferences( rawPreferences )
                setOriginalPreferences( rawPreferences )
            }
        } catch (error) {
            console.error("Failed to fetch preferences:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSave = async () => {
        if (!preferences) return

        setIsSaving(true)
        setSaveSuccess(false)

        try {
            const response = await fetch("/api/user/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(preferences),
            })

            if (response.ok) {
                const data = (await response.json()) as UserPreferences
                setPreferences(data)
                setOriginalPreferences(data)
                setSaveSuccess(true)
                setTimeout(() => setSaveSuccess(false), 3000)
            }
        } catch (error) {
            console.error("Failed to save preferences:", error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleReset = () => {
        if (originalPreferences) {
            setPreferences({ ...originalPreferences })
        }
    }

    const hasChanges =
        preferences && originalPreferences && JSON.stringify(preferences) !== JSON.stringify(originalPreferences)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!preferences) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">Failed to load preferences</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Settings</h1>
                    <p className="text-muted-foreground">Manage your account and notification preferences</p>
                </div>
                <div className="flex items-center gap-2">
                    {hasChanges && (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">
                            Unsaved Changes
                        </Badge>
                    )}
                    {saveSuccess && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Saved
                        </Badge>
                    )}
                    <Button variant="outline" onClick={handleReset} disabled={!hasChanges || isSaving}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset
                    </Button>
                    <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save Changes
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="profile" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="profile" className="gap-2">
                        <User className="h-4 w-4" />
                        Profile
                    </TabsTrigger>
                    <TabsTrigger value="alerts" className="gap-2">
                        <Bell className="h-4 w-4" />
                        Alert Preferences
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="profile">
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Mail className="h-5 w-5" />
                                    Email Address
                                </CardTitle>
                                <CardDescription>Your email address is your login. To change this, contact support.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Input
                                    type="email"
                                    placeholder="email@example.com"
                                    disabled
                                    value={preferences.emailAddress}
                                    // onChange={(e) => setPreferences({ ...preferences, emailAddress: e.target.value })}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Phone className="h-5 w-5" />
                                    Phone Number
                                </CardTitle>
                                <CardDescription>Your phone number for receiving SMS alerts</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Input
                                    type="tel"
                                    placeholder="+1 (555) 123-4567"
                                    value={preferences.phoneNumber}
                                    onChange={(e) => setPreferences({ ...preferences, phoneNumber: e.target.value })}
                                />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="alerts">
                    <div className="grid gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Delivery Method</CardTitle>
                                <CardDescription>Choose how you want to receive alert notifications</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <RadioGroup
                                    value={preferences.alertDeliveryMethod}
                                    onValueChange={(value) =>
                                        setPreferences({
                                            ...preferences,
                                            alertDeliveryMethod: value as "email" | "sms" | "both",
                                        })
                                    }
                                    className="grid gap-4 md:grid-cols-3"
                                >
                                    <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                                        <RadioGroupItem value="email" id="email" />
                                        <Label htmlFor="email" className="flex-1 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">Email Only</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-not-allowed hover:bg-muted/50 disabled">
                                        <RadioGroupItem value="sms" id="sms" disabled />
                                        <Label htmlFor="sms" className="flex-1 cursor-not-allowed">
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">SMS Only</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground">Receive notifications via text message</p>
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-not-allowed hover:bg-muted/50 disabled">
                                        <RadioGroupItem value="both" id="both" disabled />
                                        <Label htmlFor="both" className="flex-1 cursor-not-allowed">
                                            <div className="flex items-center gap-2">
                                                <Bell className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">Both</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground">Receive notifications via email and SMS</p>
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Alert Frequency</CardTitle>
                                <CardDescription>Choose when you want to receive alert notifications</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <RadioGroup
                                    value={preferences.alertFrequency}
                                    onValueChange={(value) =>
                                        setPreferences({
                                            ...preferences,
                                            alertFrequency: value as "instant" | "daily_digest" | "weekly_digest",
                                        })
                                    }
                                    className="grid gap-4"
                                >
                                    <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                                        <RadioGroupItem value="instant" id="instant" />
                                        <Label htmlFor="instant" className="flex-1 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <Bell className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">Instant Alerts</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Receive a notification immediately when an event occurs on a bill you're following
                                            </p>
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                                        <RadioGroupItem value="daily_digest" id="daily_digest" />
                                        <Label htmlFor="daily_digest" className="flex-1 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">Daily Digest</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Receive a summary of all alerts once per day at your preferred time
                                            </p>
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                                        <RadioGroupItem value="weekly_digest" id="weekly_digest" />
                                        <Label htmlFor="weekly_digest" className="flex-1 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">Weekly Digest</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Receive a summary of all alerts once per week on your preferred day
                                            </p>
                                        </Label>
                                    </div>
                                </RadioGroup>

                                {(preferences.alertFrequency === "daily_digest" ||
                                    preferences.alertFrequency === "weekly_digest") && (
                                    <>
                                        <Separator />
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Delivery Time</Label>
                                                <Select
                                                    value={preferences.digestTime}
                                                    onValueChange={(value) => setPreferences({ ...preferences, digestTime: value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select time" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="06:00">6:00 AM</SelectItem>
                                                        <SelectItem value="07:00">7:00 AM</SelectItem>
                                                        <SelectItem value="08:00">8:00 AM</SelectItem>
                                                        <SelectItem value="09:00">9:00 AM</SelectItem>
                                                        <SelectItem value="10:00">10:00 AM</SelectItem>
                                                        <SelectItem value="12:00">12:00 PM</SelectItem>
                                                        <SelectItem value="17:00">5:00 PM</SelectItem>
                                                        <SelectItem value="18:00">6:00 PM</SelectItem>
                                                        <SelectItem value="19:00">7:00 PM</SelectItem>
                                                        <SelectItem value="20:00">8:00 PM</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {preferences.alertFrequency === "weekly_digest" && (
                                                <div className="space-y-2">
                                                    <Label>Delivery Day</Label>
                                                    <Select
                                                        value={preferences.digestDay}
                                                        onValueChange={(value) =>
                                                            setPreferences({
                                                                ...preferences,
                                                                digestDay: value as UserPreferences["digestDay"],
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select day" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="monday">Monday</SelectItem>
                                                            <SelectItem value="tuesday">Tuesday</SelectItem>
                                                            <SelectItem value="wednesday">Wednesday</SelectItem>
                                                            <SelectItem value="thursday">Thursday</SelectItem>
                                                            <SelectItem value="friday">Friday</SelectItem>
                                                            <SelectItem value="saturday">Saturday</SelectItem>
                                                            <SelectItem value="sunday">Sunday</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Alert Types</CardTitle>
                                <CardDescription>Choose which types of events you want to be notified about</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-4">
                                    <div className="flex items-center space-x-3 rounded-lg border p-4">
                                        <Checkbox
                                            id="billStatusChange"
                                            checked={preferences.enabledAlertTypes.billStatusChange}
                                            onCheckedChange={(checked) =>
                                                setPreferences({
                                                    ...preferences,
                                                    enabledAlertTypes: {
                                                        ...preferences.enabledAlertTypes,
                                                        billStatusChange: checked as boolean,
                                                    },
                                                })
                                            }
                                        />
                                        <Label htmlFor="billStatusChange" className="flex-1 cursor-pointer">
                                            <span className="font-medium">Bill Status Changes</span>
                                            <p className="text-sm text-muted-foreground">
                                                When a bill moves to a new stage (e.g., committee to floor)
                                            </p>
                                        </Label>
                                    </div>

                                    <div className="flex items-center space-x-3 rounded-lg border p-4">
                                        <Checkbox
                                            id="committeeVote"
                                            checked={preferences.enabledAlertTypes.committeeVote}
                                            onCheckedChange={(checked) =>
                                                setPreferences({
                                                    ...preferences,
                                                    enabledAlertTypes: {
                                                        ...preferences.enabledAlertTypes,
                                                        committeeVote: checked as boolean,
                                                    },
                                                })
                                            }
                                        />
                                        <Label htmlFor="committeeVote" className="flex-1 cursor-pointer">
                                            <span className="font-medium">Committee Votes</span>
                                            <p className="text-sm text-muted-foreground">
                                                When a committee votes on a bill you're following
                                            </p>
                                        </Label>
                                    </div>

                                    <div className="flex items-center space-x-3 rounded-lg border p-4">
                                        <Checkbox
                                            id="floorVote"
                                            checked={preferences.enabledAlertTypes.floorVote}
                                            onCheckedChange={(checked) =>
                                                setPreferences({
                                                    ...preferences,
                                                    enabledAlertTypes: {
                                                        ...preferences.enabledAlertTypes,
                                                        floorVote: checked as boolean,
                                                    },
                                                })
                                            }
                                        />
                                        <Label htmlFor="floorVote" className="flex-1 cursor-pointer">
                                            <span className="font-medium">Floor Votes</span>
                                            <p className="text-sm text-muted-foreground">
                                                When a floor vote occurs on a bill you're following
                                            </p>
                                        </Label>
                                    </div>

                                    <div className="flex items-center space-x-3 rounded-lg border p-4">
                                        <Checkbox
                                            id="newCrossfile"
                                            checked={preferences.enabledAlertTypes.newCrossfile}
                                            onCheckedChange={(checked) =>
                                                setPreferences({
                                                    ...preferences,
                                                    enabledAlertTypes: {
                                                        ...preferences.enabledAlertTypes,
                                                        newCrossfile: checked as boolean,
                                                    },
                                                })
                                            }
                                        />
                                        <Label htmlFor="newCrossfile" className="flex-1 cursor-pointer">
                                            <span className="font-medium">New Crossfiles</span>
                                            <p className="text-sm text-muted-foreground">
                                                When a crossfile is introduced for a bill you're following
                                            </p>
                                        </Label>
                                    </div>

                                    <div className="flex items-center space-x-3 rounded-lg border p-4">
                                        <Checkbox
                                            id="hearingScheduled"
                                            checked={preferences.enabledAlertTypes.hearingScheduled}
                                            onCheckedChange={(checked) =>
                                                setPreferences({
                                                    ...preferences,
                                                    enabledAlertTypes: {
                                                        ...preferences.enabledAlertTypes,
                                                        hearingScheduled: checked as boolean,
                                                    },
                                                })
                                            }
                                        />
                                        <Label htmlFor="hearingScheduled" className="flex-1 cursor-pointer">
                                            <span className="font-medium">Hearing Scheduled</span>
                                            <p className="text-sm text-muted-foreground">
                                                When a hearing is scheduled for a bill you're following
                                            </p>
                                        </Label>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </>
    )
}
