export interface CalendarItem {
    id: string
    billNumber: string
    title: string
    committee?: string
    report?: string
    posture?: string
    proceedings?: string
    chamber: "SENATE" | "HOUSE"
    section: "Second Reading" | "Third Reading"
    voteResult?: {
        result: "Passed" | "Failed"
        yeas: number
        nays: number
    }
}

export interface CalendarDay {
    date: string
    chamber: "SENATE" | "HOUSE"
    section: "Second Reading" | "Third Reading"
    items: CalendarItem[]
}

export interface CalendarResponse {
    days: CalendarDay[]
}

export interface Bill {
    billNumber: string
    title: string
    chamber: "SENATE" | "HOUSE"
    crossfile?: string
    sponsor?: string
    synopsis?: string
    latestStatus?: string
    latestAgenda?: string
    history?: BillHistoryEvent[]
    committeeVotes?: CommitteeVote[]
    floorVotes?: FloorVote[]
}

export interface Note {
    id: string
    billNumber: string
    body: string
    pinned: boolean
    author: string
    createdAt: string
    updatedAt: string
}

export interface AlertRule {
    id: string
    chamber?: "SENATE" | "HOUSE"
    stage?: "Second Reading" | "Third Reading"
    billNumber?: string
    committee?: string
    matchText?: string
    emailEnabled: boolean
    createdAt: string
}

export interface BillHistoryEvent {
    id: string
    date: string
    action: string
    chamber: "SENATE" | "HOUSE"
    details?: string
}

export interface CommitteeVote {
    id: string
    date: string
    committee: string
    result: "Favorable" | "Unfavorable" | "Favorable with Amendments" | "No Recommendation"
    yeas: number
    nays: number
    absent?: number
    details?: string
}

export interface FloorVote {
    id: string
    date: string
    chamber: "SENATE" | "HOUSE"
    voteType: "Second Reading" | "Third Reading" | "Final Passage"
    result: "Passed" | "Failed"
    yeas: number
    nays: number
    absent?: number
    notVoting?: number
}
