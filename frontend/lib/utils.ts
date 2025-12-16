import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getCommitteeAbbreviation(committeeName: string): string {
    const abbreviations: Record<string, string> = {
        "Budget and Taxation": "B&T",
        "Budget & Taxation": "B&T",
        "Economic Matters": "ECM",
        "Education, Energy, and the Environment": "EEE",
        "Education Energy and the Environment": "EEE",
        "Environment and Transportation": "ENV",
        "Finance": "FIN",
        "Finance Committee": "FIN",
        "Health and Government Operations": "HGO",
        "Judiciary": "JPR",
        "Judiciary Committee": "JPR",
        "Judicial Proceedings": "JPR",
        "Ways and Means": "W&M",
        "Appropriations": "APP",
        "Rules and Executive Nominations": "REN",
        "Executive Nominations": "EXN",
    }

    // Try exact match first
    if (abbreviations[committeeName]) {
        return abbreviations[committeeName]
    }

    // Try case-insensitive match
    const lowerName = committeeName.toLowerCase()
    for (const [fullName, abbr] of Object.entries(abbreviations)) {
        if (fullName.toLowerCase() === lowerName) {
            return abbr
        }
    }

    // If no match found, return the original name
    return committeeName
}