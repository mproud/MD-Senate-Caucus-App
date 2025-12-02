import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import type { Bill } from "@/lib/types"

interface BillHeaderProps {
    bill: Bill
}

export function BillHeader({ bill }: BillHeaderProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-2xl">{bill.billNumber}</CardTitle>
                            <Badge variant="outline">{bill.chamber}</Badge>
                            {bill.crossfile && <Badge variant="secondary">Crossfile: {bill.crossfile}</Badge>}
                        </div>
                        <p className="mt-3 text-base leading-relaxed text-pretty">{bill.title}</p>
                    </div>
                </div>
            </CardHeader>
        </Card>
    )
}
