export const mockBills = [
    {
        billNumber: "HB0001",
        title: "Education - Public Schools - Student Mental Health Services",
        chamber: "House",
        sponsor: "Delegate Smith",
        committee: "Education, Energy, and the Environment",
        synopsis:
            "Requiring county boards of education to provide comprehensive mental health services to students in public schools; requiring the State Department of Education to develop guidelines for mental health services; etc.",
        status: "Third Reading",
        crossfile: "SB0123",
        subjects: ["Education", "Health"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/hb0001.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/hb/hb0001f.pdf",
        floorVotes: [
            {
                id: "fv1",
                date: "2025-02-10",
                chamber: "House",
                voteType: "Second Reading",
                result: "Passed",
                yeas: 98,
                nays: 42,
                absent: 1,
            },
        ],
    },
    {
        billNumber: "HB0015",
        title: "Criminal Law - Theft - Organized Retail Theft",
        chamber: "House",
        sponsor: "Delegate Johnson",
        committee: "Judiciary Committee",
        synopsis:
            "Establishing the crime of organized retail theft; providing penalties for organized retail theft; requiring certain restitution; etc.",
        status: "Second Reading",
        crossfile: null,
        subjects: ["Criminal Law", "Commerce"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/hb0015.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/hb/hb0015f.pdf",
        history: [
            {
                id: "h1",
                date: "2025-01-10",
                action: "First Reading",
                chamber: "House",
                details: "Bill filed and assigned to Judiciary Committee",
            },
            {
                id: "h2",
                date: "2025-01-15",
                action: "Hearing Scheduled",
                chamber: "House",
                details: "Public hearing scheduled in Judiciary Committee",
            },
            {
                id: "h3",
                date: "2025-01-22",
                action: "Committee Hearing",
                chamber: "House",
                details: "Public hearing held - testimony from retailers and law enforcement",
            },
            {
                id: "h4",
                date: "2025-01-29",
                action: "Committee Vote",
                chamber: "House",
                details: "Reported favorably with amendments by Judiciary Committee",
            },
            {
                id: "h5",
                date: "2025-02-05",
                action: "Second Reading",
                chamber: "House",
                details: "Placed on Second Reading calendar",
            },
            {
                id: "h6",
                date: "2025-02-15",
                action: "Second Reading Scheduled",
                chamber: "House",
                details: "Scheduled for floor vote on Second Reading",
            },
        ],
        committeeVotes: [
            {
                id: "cv1",
                date: "2025-01-29",
                committee: "Judiciary Committee",
                result: "Favorable with Amendments",
                yeas: 15,
                nays: 6,
                absent: 2,
                details:
                    "Committee adopted amendments to clarify definition of 'organized retail theft' and increase penalties for repeat offenders",
            },
        ],
        floorVotes: [],
    },
    {
        billNumber: "SB0123",
        title: "Education - Public Schools - Student Mental Health Services",
        chamber: "Senate",
        sponsor: "Senator Williams",
        committee: "Education, Energy, and the Environment",
        synopsis:
            "Requiring county boards of education to provide comprehensive mental health services to students in public schools; requiring the State Department of Education to develop guidelines for mental health services; etc.",
        status: "Third Reading",
        crossfile: "HB0001",
        subjects: ["Education", "Health"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/sb0123.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/sb/sb0123f.pdf",
    },
    {
        billNumber: "SB0045",
        title: "Environment - Renewable Energy - Solar Panel Recycling",
        chamber: "Senate",
        sponsor: "Senator Davis",
        committee: "Finance",
        synopsis:
            "Requiring manufacturers of solar panels to establish a recycling program; establishing requirements for solar panel recycling programs; etc.",
        status: "Second Reading",
        crossfile: "HB0234",
        subjects: ["Environment", "Energy"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/sb0045.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/sb/sb0045f.pdf",
    },
    {
        billNumber: "HB0234",
        title: "Environment - Renewable Energy - Solar Panel Recycling",
        chamber: "House",
        sponsor: "Delegate Brown",
        committee: "Environment and Transportation",
        synopsis:
            "Requiring manufacturers of solar panels to establish a recycling program; establishing requirements for solar panel recycling programs; etc.",
        status: "Second Reading",
        crossfile: "SB0045",
        subjects: ["Environment", "Energy"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/hb0234.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/hb/hb0234f.pdf",
    },
    {
        billNumber: "HB0089",
        title: "Transportation - Electric Vehicles - Charging Infrastructure",
        chamber: "House",
        sponsor: "Delegate Martinez",
        committee: "Environment and Transportation",
        synopsis:
            "Requiring the Maryland Department of Transportation to develop a plan for electric vehicle charging infrastructure; establishing a grant program for electric vehicle charging stations; etc.",
        status: "Third Reading",
        crossfile: null,
        subjects: ["Transportation", "Environment"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/hb0089.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/hb/hb0089f.pdf",
    },
    {
        billNumber: "SB0167",
        title: "Health - Prescription Drug Affordability Board - Establishment",
        chamber: "Senate",
        sponsor: "Senator Lee",
        committee: "Finance",
        synopsis:
            "Establishing the Prescription Drug Affordability Board; providing for the membership, powers, and duties of the Board; authorizing the Board to establish upper payment limits for prescription drugs; etc.",
        status: "Third Reading",
        crossfile: "HB0456",
        subjects: ["Health", "Insurance"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/sb0167.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/sb/sb0167f.pdf",
    },
    {
        billNumber: "HB0456",
        title: "Health - Prescription Drug Affordability Board - Establishment",
        chamber: "House",
        sponsor: "Delegate Chen",
        committee: "Health and Government Operations",
        synopsis:
            "Establishing the Prescription Drug Affordability Board; providing for the membership, powers, and duties of the Board; authorizing the Board to establish upper payment limits for prescription drugs; etc.",
        status: "Third Reading",
        crossfile: "SB0167",
        subjects: ["Health", "Insurance"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/hb0456.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/hb/hb0456f.pdf",
    },
    {
        billNumber: "SB0089",
        title: "Labor and Employment - Paid Family and Medical Leave Insurance Program",
        chamber: "Senate",
        sponsor: "Senator Thompson",
        committee: "Finance",
        synopsis:
            "Establishing the Paid Family and Medical Leave Insurance Program; requiring covered employers and covered employees to pay contributions to the Program; providing benefits under the Program; etc.",
        status: "Second Reading",
        crossfile: null,
        subjects: ["Labor", "Insurance"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/sb0089.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/sb/sb0089f.pdf",
    },
    {
        billNumber: "HB0567",
        title: "Housing - Affordable Housing - Tax Credits",
        chamber: "House",
        sponsor: "Delegate Garcia",
        committee: "Ways and Means",
        synopsis:
            "Expanding the Low-Income Housing Tax Credit; establishing requirements for affordable housing developments; providing tax credits for developers of affordable housing; etc.",
        status: "Second Reading",
        crossfile: "SB0234",
        subjects: ["Housing", "Taxation"],
        fiscalNote: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0001/hb0567.pdf",
        billText: "https://mgaleg.maryland.gov/2025RS/bills/hb/hb0567f.pdf",
    },
]

export const mockProceedings = [
    {
        id: "1",
        date: "2025-02-15",
        time: "10:00 AM",
        section: "Second Reading",
        chamber: "House",
        bills: ["HB0015", "HB0234", "HB0567"],
    },
    {
        id: "2",
        date: "2025-02-15",
        time: "2:00 PM",
        section: "Third Reading",
        chamber: "House",
        bills: ["HB0001", "HB0089", "HB0456"],
        voteResults: {
            HB0001: { result: "Passed" as const, yeas: 98, nays: 42 },
            HB0089: { result: "Passed" as const, yeas: 105, nays: 35 },
            HB0456: { result: "Passed" as const, yeas: 92, nays: 48 },
        },
    },
    {
        id: "3",
        date: "2025-02-15",
        time: "10:00 AM",
        section: "Second Reading",
        chamber: "Senate",
        bills: ["SB0045", "SB0089"],
    },
    {
        id: "4",
        date: "2025-02-15",
        time: "2:00 PM",
        section: "Third Reading",
        chamber: "Senate",
        bills: ["SB0123", "SB0167"],
        voteResults: {
            SB0123: { result: "Passed" as const, yeas: 35, nays: 12 },
            SB0167: { result: "Failed" as const, yeas: 18, nays: 29 },
        },
    },
    {
        id: "5",
        date: "2025-02-16",
        time: "10:00 AM",
        section: "Second Reading",
        chamber: "House",
        bills: ["HB0234"],
    },
    {
        id: "6",
        date: "2025-02-16",
        time: "2:00 PM",
        section: "Third Reading",
        chamber: "Senate",
        bills: ["SB0123", "SB0167"],
    },
]

export const mockNotes: Record<
    string,
    Array<{
        id: string
        billNumber: string
        content: string
        createdAt: string
        userId: string
    }>
> = {
    HB0001: [
        {
            id: "note1",
            billNumber: "HB0001",
            content:
                "This bill has strong bipartisan support. Key stakeholders include the Maryland State Education Association and the Maryland Association of School Psychologists.",
            createdAt: "2025-01-15T10:30:00Z",
            userId: "user_demo",
        },
        {
            id: "note2",
            billNumber: "HB0001",
            content: "Fiscal note shows $50M annual cost. Need to follow up on funding source.",
            createdAt: "2025-01-20T14:15:00Z",
            userId: "user_demo",
        },
    ],
    SB0123: [
        {
            id: "note3",
            billNumber: "SB0123",
            content: "Crossfile of HB0001. Senate version has slightly different implementation timeline.",
            createdAt: "2025-01-18T09:00:00Z",
            userId: "user_demo",
        },
    ],
}

export const mockAlertRules = [
    {
        id: "alert1",
        name: "Education Bills",
        billNumber: null,
        subject: "Education",
        chamber: null,
        sponsor: null,
        active: true,
        createdAt: "2025-01-10T08:00:00Z",
    },
    {
        id: "alert2",
        name: "Watch HB0001",
        billNumber: "HB0001",
        subject: null,
        chamber: null,
        sponsor: null,
        active: true,
        createdAt: "2025-01-12T10:30:00Z",
    },
    {
        id: "alert3",
        name: "Senate Health Bills",
        billNumber: null,
        subject: "Health",
        chamber: "Senate",
        sponsor: null,
        active: true,
        createdAt: "2025-01-15T14:00:00Z",
    },
    {
        id: "alert4",
        name: "Delegate Smith Bills",
        billNumber: null,
        subject: null,
        chamber: null,
        sponsor: "Delegate Smith",
        active: false,
        createdAt: "2025-01-08T11:00:00Z",
    },
]

// Helper function to get bills by numbers
export function getBillsByNumbers(billNumbers: string[]) {
    return mockBills.filter((bill) => billNumbers.includes(bill.billNumber))
}

// Helper function to get a single bill
export function getBillByNumber(billNumber: string) {
    return mockBills.find((bill) => bill.billNumber === billNumber)
}

// Helper function to filter proceedings
export function filterProceedings(
    chambers?: string[],
    sections?: string[],
    dates?: string[],
    sponsors?: string[],
    committees?: string[],
    subjects?: string[],
    searchText?: string,
) {
    return mockProceedings.filter((proc) => {
        if (chambers && chambers.length > 0 && !chambers.includes(proc.chamber)) return false
        if (sections && sections.length > 0 && !sections.includes(proc.section)) return false
        if (dates && dates.length > 0 && !dates.includes(proc.date)) return false

        if (sponsors || committees || subjects || searchText) {
            const bills = getBillsByNumbers(proc.bills)
            const hasMatchingBill = bills.some((bill) => {
                if (sponsors && sponsors.length > 0 && !sponsors.includes(bill.sponsor)) return false

                if (committees && committees.length > 0) {
                    const billCommittees = bill.committeeVotes?.map((v) => v.committee) || []
                    if (!committees.some((c) => billCommittees.includes(c))) return false
                }

                if (subjects && subjects.length > 0) {
                    if (!subjects.some((s) => bill.subjects.includes(s))) return false
                }

                if (searchText) {
                    const search = searchText.toLowerCase()
                    const matchesSearch =
                        bill.billNumber.toLowerCase().includes(search) ||
                        bill.title.toLowerCase().includes(search) ||
                        bill.synopsis.toLowerCase().includes(search) ||
                        bill.sponsor.toLowerCase().includes(search)
                    if (!matchesSearch) return false
                }

                return true
            })

            if (!hasMatchingBill) return false
        }

        return true
    })
}

// Helper functions to extract unique filter options
export function getUniqueSponsors() {
    return Array.from(new Set(mockBills.map((bill) => bill.sponsor))).sort()
}

export function getUniqueCommittees() {
    const committees = new Set<string>()
    mockBills.forEach((bill) => {
        if (bill.committeeVotes) {
            bill.committeeVotes.forEach((vote) => {
                committees.add(vote.committee)
            })
        }
        if (bill.committee) {
            committees.add(bill.committee)
        }
    })
    return Array.from(committees).sort()
}

export function getUniqueSubjects() {
    const subjects = new Set<string>()
    mockBills.forEach((bill) => {
        bill.subjects.forEach((subject) => subjects.add(subject))
    })
    return Array.from(subjects).sort()
}

export const manualVotes: Record<
    string,
    {
        committeeVotes: Array<{
            id: string
            date: string
            committee: string
            result: string
            yeas: number
            nays: number
            absent?: number
            details?: string
        }>
        floorVotes: Array<{
            id: string
            date: string
            chamber: string
            voteType: string
            result: string
            yeas: number
            nays: number
            absent?: number
            notVoting?: number
        }>
    }
> = {}
