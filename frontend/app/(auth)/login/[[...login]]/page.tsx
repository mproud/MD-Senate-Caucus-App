"use client"

import { SignIn } from "@clerk/nextjs"

const LoginPage = () => {
    return (
        <SignIn
            appearance={{
                // variables: {
                //     colorPrimary: 'red',
                //     borderRadius: '0',
                // },
                elements: {
                    rootBox: "w-full shadow-none border-0",
                    cardBox: "w-full bg-red-50 border-0",
                    card: "w-full md:min-h-[450px]",
                    // main: "w-full bg-red-50",
                    // card: "shadow-none border-0 bg-transparent p-0 w-full",


                    // tighten header spacing to match the panel
                    // header: "px-0 pt-0",
                    // footer: "px-0 pb-0",
                }
            }}
        />
    )
}

export default LoginPage
