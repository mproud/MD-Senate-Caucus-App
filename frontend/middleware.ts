import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
    '/login(.*)',
    '/register',
    '/waitlist',
    '/api/webhooks/clerk',
])

const isRedirectIfAuthedRoute = createRouteMatcher([
    '/',
    '/login(.*)',
    '/register(.*)',
    '/waitlist(.*)',
])

// Block any redirect_urls that go to places users don't normally need to be
function isAllowedRedirectPath( pathname: string ) {
    if (pathname.startsWith('/api')) return false
    if (pathname.startsWith('/trpc')) return false
    if (pathname.startsWith('/_next')) return false

    return true
}

const isAdminRoute = createRouteMatcher(["/admin(.*)"])
const isApiAdminRoute = createRouteMatcher(["/api/admin(.*)"])

// Make sure the redirect_url is same origin
function getSafeSameOriginRedirect(req: Request, raw: string | null): string | null {
    if (!raw) return null
    const value = raw.trim()
    if (!value) return null

    // Block protocol-relative URLs and backslash tricks
    if (value.startsWith('//') || value.startsWith('\\')) return null

    let targetPath = ''

    // Allow plain relative paths
    if (value.startsWith('/')) {
        targetPath = value
    } else {
        // Only allow absolute URLs that match this request's origin
        try {
            const reqUrl = new URL(req.url)
            const target = new URL(value)

            if (target.origin !== reqUrl.origin) return null
            
            targetPath = `${target.pathname}${target.search}${target.hash}`
        } catch {
            return null
        }
    }

    // Enforce path restrictions
    const pathnameOnly = targetPath.split('?')[0].split('#')[0]
    if (!isAllowedRedirectPath(pathnameOnly)) return null

    return targetPath
}

export default clerkMiddleware(async (auth, req) => {
    const { userId, sessionClaims } = await auth()

    // If signed in and on marketing/auth pages, bounce to dashboard
    if (userId && isRedirectIfAuthedRoute(req)) {
        const url = req.nextUrl.clone()

        const rawRedirect =
            url.searchParams.get('redirect_url') ?? url.searchParams.get('redirectUrl')

        const safeRedirect = getSafeSameOriginRedirect(req, rawRedirect)

        // If safeRedirect includes query/hash, set via href to preserve them
        if (safeRedirect) {
            url.href = new URL(safeRedirect, req.url).toString()
            return NextResponse.redirect(url)
        }

        url.pathname = '/dashboard'
        url.search = ''
        url.hash = ''
        return NextResponse.redirect(url)
    }

    if ( ! isPublicRoute( req )) {
        await auth.protect()
    }

    // Check if accessing admin routes
    // if (isAdminRoute(req) || isApiAdminRoute(req)) {
    //     // If not signed in, redirect to sign-in
    //     if ( ! userId) {
    //         const signInUrl = new URL("/login", req.url)
    //         signInUrl.searchParams.set("redirect_url", req.url)
    //         return NextResponse.redirect(signInUrl)
    //     }

    //     // Check if user has admin role
    //     const role = (sessionClaims?.publicMetadata as { role?: string })?.role
    //     if (role !== "admin" && role !== "super_admin") {
    //         console.log('>>>>> NOT ADMIN!', role)
    //         // Redirect non-admins to dashboard
    //         return NextResponse.redirect(new URL("/?issue=not_admin", req.url))
    //     }
    // }

    return NextResponse.next()
})


export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',

        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
}