import { Navbar } from "@/components/nav-bar";
import { PrintUserFooter } from "@/components/print-user-footer";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <>
            <div className="min-h-screen bg-background">
                <Navbar />

                <main className="container py-8">
                    {children}
                </main>
            </div>

            <PrintUserFooter />
            <Toaster />
        </>
    )
}
