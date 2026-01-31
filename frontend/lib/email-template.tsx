import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Section,
    Text,
    Tailwind,
    Hr,
} from '@react-email/components'

export function Email(props: { url: string }) {
    const { url } = props

    return (
        <Html lang="en">
            Hello World
        </Html>
    )
}

export const EmailTemplate = ( props: { html: string, preview?: string } ) => {
    const { html, preview } = props

    return (
        <Html lang="en" dir="ltr">
            <Head />
            {preview && (
                <Preview>
                    {preview}
                </Preview>
            )}
            <Tailwind>
                <Body className="bg-gray-100 py-[40px] font-sans">
                    <Container className="bg-white rounded-[8px] shadow-lg max-w-[600px] mx-auto p-[32px]">
                        {/* Header */}
                        <Section className="text-center mb-[32px]">
                            <Heading className="text-[28px] font-bold text-gray-900 m-0 mb-[8px]">
                                Caucus Report
                            </Heading>
                            {/* <Text className="text-[16px] text-blue-600 font-semibold m-0">
                                Legislative Update Alert
                            </Text> */}
                        </Section>

                        <Hr className="border-gray-200 my-[24px]" />

                        <Section className="mb-[32px] px-[24px]">
                            <div dangerouslySetInnerHTML={{ __html: html }} />
                        </Section>

                        {/* <Hr className="border-gray-200 my-[24px]" />

                        <Section className="mb-[32px]">
                            <Heading className="text-[24px] font-bold text-gray-900 mb-[16px]">
                                House Bill 247: Education Funding Reform Act
                            </Heading>
                            
                            <Text className="text-[16px] text-gray-700 mb-[16px] leading-[24px]">
                                <strong>Status:</strong> Passed Committee - Scheduled for Floor Vote
                            </Text>
                            
                            <Text className="text-[16px] text-gray-700 mb-[16px] leading-[24px]">
                                <strong>Sponsor:</strong> Delegate Sarah Johnson (District 15)
                            </Text>
                            
                            <Text className="text-[16px] text-gray-700 mb-[16px] leading-[24px]">
                                <strong>Committee:</strong> Ways and Means Committee
                            </Text>
                            
                            <Text className="text-[16px] text-gray-700 mb-[24px] leading-[24px]">
                                <strong>Expected Floor Vote:</strong> February 15, 2026
                            </Text>
                        </Section>

                        <Section className="mb-[32px]">
                            <Heading className="text-[20px] font-bold text-gray-900 mb-[16px]">
                                Bill Summary
                            </Heading>
                            
                            <Text className="text-[16px] text-gray-700 mb-[16px] leading-[24px]">
                                The Education Funding Reform Act proposes significant changes to how Maryland allocates funding to public schools across the state. Key provisions include:
                            </Text>
                            
                            <Text className="text-[16px] text-gray-700 mb-[8px] leading-[24px]">
                                • Increased per-pupil funding by 15% over three years
                            </Text>
                            <Text className="text-[16px] text-gray-700 mb-[8px] leading-[24px]">
                                • Enhanced support for schools in underserved communities
                            </Text>
                            <Text className="text-[16px] text-gray-700 mb-[8px] leading-[24px]">
                                • New teacher retention incentive programs
                            </Text>
                            <Text className="text-[16px] text-gray-700 mb-[16px] leading-[24px]">
                                • Technology infrastructure improvements statewide
                            </Text>
                        </Section>

                        <Section className="mb-[32px] bg-blue-50 p-[20px] rounded-[8px]">
                            <Heading className="text-[18px] font-bold text-blue-900 mb-[12px]">
                                Potential Impact
                            </Heading>
                            
                            <Text className="text-[16px] text-blue-800 mb-[12px] leading-[24px]">
                                If passed, this legislation could affect over 900,000 Maryland students and require an estimated $2.1 billion in additional state funding over the next three years.
                            </Text>
                            
                            <Text className="text-[16px] text-blue-800 leading-[24px]">
                                The bill has bipartisan support but faces concerns about implementation timeline and funding sources.
                            </Text>
                        </Section>

                        <Section className="mb-[32px]">
                            <Heading className="text-[20px] font-bold text-gray-900 mb-[16px]">
                                How You Can Stay Informed
                            </Heading>
                            
                            <Text className="text-[16px] text-gray-700 mb-[16px] leading-[24px]">
                                <Link href="https://mgaleg.maryland.gov" className="text-blue-600 underline">
                                    Track HB 247 on the Maryland General Assembly website
                                </Link>
                            </Text>
                            
                            <Text className="text-[16px] text-gray-700 mb-[16px] leading-[24px]">
                                <Link href="mailto:your.delegate@maryland.gov" className="text-blue-600 underline">
                                    Contact your local delegate
                                </Link> to share your thoughts on this legislation
                            </Text>
                            
                            <Text className="text-[16px] text-gray-700 leading-[24px]">
                                Watch the live floor debate on February 15th via the 
                                <Link href="https://mgahouse.maryland.gov/live" className="text-blue-600 underline ml-[4px]">
                                    House live stream
                                </Link>
                            </Text>
                        </Section> */}

                        <Hr className="border-gray-200 my-[24px]" />

                        {/* Footer */}
                        <Section className="text-center">
                            <Text className="text-[14px] text-gray-600 mb-[8px] m-0">
                                CaucusReport.com
                            </Text>
                            <Text className="text-[14px] text-gray-600 mb-[16px] m-0">
                                <Link href="https://www.caucusreport.com/dashboard" className="text-blue-600 underline">
                                    Dashboard
                                </Link> | 
                                <Link href="https://www.caucusreport.com/user" className="text-blue-600 underline ml-[8px]">
                                    Update Preferences
                                </Link>
                            </Text>
                            {/* <Text className="text-[12px] text-gray-500 m-0">
                                Not for distribution
                            </Text> */}
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    )
};