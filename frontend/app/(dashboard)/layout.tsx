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
                <div className="w-full bg-orange-300 text-black border-b border-red-900 print:hidden">
                    <div className="mx-auto max-w-7xl px-4 py-2 text-center text-sm">
                        <strong>Maintenance Notice:</strong>{" "}
                        Automated vote processing has been fixed and will be manually running to verify the issue has been resolved.
                    </div>
                </div>

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
