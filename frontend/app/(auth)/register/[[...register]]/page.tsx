import { SignUp } from "@clerk/nextjs"

const RegisterPage = () => {
    return (
        <div className="flex flex-col gap-6">
            <SignUp />
        </div>
    )
}

export default RegisterPage