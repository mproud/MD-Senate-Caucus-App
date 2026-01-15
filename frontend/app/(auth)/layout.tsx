import { Card, CardContent } from "@/components/ui/card";
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
                <div className="flex flex-col gap-y-6">
                    <Card className="overflow-hidden p-0">
                        <CardContent className="grid p-0 md:grid-cols-2">
                            <div className="">{/* -- p-6 md:p-8 */}
                                {children}
                            </div>
                            <div className="bg-muted relative hidden md:block">
                                <img
                                    src="/images/pexels-priscilla-palm-2152519275-32241020.jpg"
                                    alt=""
                                    className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
                                />
                            </div>
                        </CardContent>
                    </Card>
                    {/* <FieldDescription className="px-6 text-center">
                        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
                        and <a href="#">Privacy Policy</a>.
                    </FieldDescription> */}
                </div>
            </div>
        </div>
    )
}
