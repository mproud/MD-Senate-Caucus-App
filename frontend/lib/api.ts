import { auth } from "@clerk/nextjs/server"

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message)
        this.name = "ApiError"
    }
}

// Client-side fetch with Clerk auth token
async function fetchWithClientAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
        const response = await fetch(endpoint, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new ApiError(response.status, errorText || response.statusText)
        }

        // Handle PDF responses
        if (response.headers.get("content-type")?.includes("application/pdf")) {
            return response.blob() as T
        }

        return response.json()
    } catch (error) {
        if (error instanceof ApiError) {
            throw error
        }
        throw new ApiError(500, error instanceof Error ? error.message : "Unknown error")
    }
}

// Server-side fetch with Clerk auth token
async function fetchWithServerAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const { getToken } = await auth()
    const token = await getToken()

    try {
        const response = await fetch(endpoint, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers,
            },
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new ApiError(response.status, errorText || response.statusText)
        }

        // Handle PDF responses
        if (response.headers.get("content-type")?.includes("application/pdf")) {
            return response.blob() as T
        }

        return response.json()
    } catch (error) {
        if (error instanceof ApiError) {
            throw error
        }
        throw new ApiError(500, error instanceof Error ? error.message : "Unknown error")
    }
}

// Main fetch function that works in both client and server contexts
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Check if we're on the server or client
    const isServer = typeof window === "undefined"

    // Use absolute URL for server-side fetches
    const url = isServer ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${endpoint}` : endpoint

    console.log('Fetch from URL', { url, isServer })

    if (isServer) {
        return fetchWithServerAuth<T>(url, options)
    } else {
        return fetchWithClientAuth<T>(url, options)
    }
}

export async function fetchApiWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return fetchApi<T>(endpoint, options)
}
