import { Waitlist } from "@clerk/nextjs"

export default function WaitlistPage() {
    return (
        <Waitlist
            appearance={{
                elements: {
                    rootBox: "w-full shadow-none border-0",
                    cardBox: "w-full bg-red-50 border-0",
                    card: "w-full md:min-h-[450px]",
                }
            }}
        />
    )
}