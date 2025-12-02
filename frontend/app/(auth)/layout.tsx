import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Log In",
}

export default function AuthLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-sm md:max-w-4xl">
                {children}
            </div>
        </div>
    )
}
