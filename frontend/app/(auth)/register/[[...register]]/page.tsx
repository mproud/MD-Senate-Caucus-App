import { SignUp } from "@clerk/nextjs"

const RegisterPage = () => {
    return (
        <SignUp
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

export default RegisterPage