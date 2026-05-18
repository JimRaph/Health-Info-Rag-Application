'use client'

import { motion } from 'framer-motion'
import { HeartIcon } from '@heroicons/react/24/solid'
import { signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import Image from 'next/image'
import { useAuthStore } from '@/stores/authStore'
import { RegisterData } from '@/types/api'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function RegisterForm() {
    const { register, handleSubmit } = useForm<RegisterData>()
    const { isLoading, setLoading, setError, error } = useAuthStore()
    const router = useRouter()
    
    const onSubmit = async (data: RegisterData) => {
        try {
        setError(null)
        setLoading(true)

        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })

        const response = await res.json()

        if (response.error){
          setError(response.error)
        }

        const loginRes = await signIn('credentials', {
            redirect: false,
            email: data.email,
            password: data.password
        })

        if (loginRes?.error) {
            setError('Login failed.')
        } else{
          router.push('/')
        }
        } catch (err) {
        console.error(err)
        setError('Something went wrong.')
        } finally {
        setLoading(false)
        }
    }

    const handleGoogleSignIn = async () => {
        setLoading(true);
        try {
        await signIn("google", { callbackUrl: "/" });
        } catch (err: unknown) {
        setError(`Google sign-in failed: ${err}`);
        } finally {
        setLoading(false);
        }
    }

  useEffect(() => {
    if (error) {
      const clearError = setTimeout(() => {
        setError(null);
      }, 3000);

      return () => clearTimeout(clearError);
    }
  }, [error, setError]);


return (
  <div className="flex min-h-screen">
    <motion.div
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="hidden lg:flex flex-col justify-center items-center 
        w-1/2 relative bg-linear-to-br from-blue-300 via-blue-400
        to-blue-500 text-white overflow-hidden hover:cursor-default"
    >

      <div className="flex items-center mb-2">
        <div className="w-15 h-15 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-300">
          <span className="text-white font-bold text-lg">M</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-100 ml-1">
          edi
          <span className="text-blue-100 font-semibold">Fact</span>
        </h1>
      </div>


      <div className="text-gray-50 max-w-md text-center leading-relaxed">
        <p>
          Create your account and start your AI-powered health information
          journey.
        </p>
      </div>

      <svg
        className="absolute bottom-0 left-0 w-full opacity-50"
        viewBox="0 0 800 400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,320 C200,280 600,360 800,320 L800,400 L0,400 Z"
          fill="white"
        />
      </svg>
    </motion.div>

    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-white"
    >
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-gray-600">
            Create your account
          </h2>
          <p className="mt-2 text-gray-500">
            Sign up with your details or continue with Google.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="text-gray-700">
          <div className="mb-4">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Full Name
            </label>
            <input
              id="name"
              {...register("name")}
              type="text"
              required
              className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email address
            </label>
            <input
              id="email"
              {...register("email")}
              type="email"
              required
              className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              {...register("password")}
              type="password"
              required
              className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-2 
                focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </div>

          {error && <p className="text-red-800">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium 
              py-2 mt-2 rounded-lg transition"
          >
            {isLoading ? "Creating account..." : "Register"}
          </button>
        </form>

        <div
          className="flex items-center justify-center gap-2 w-full 
            text-gray-700"
        >
          Already have an account?
          <span onClick={() => router.push("/login")}
            className='hover:cursor-pointer hover:text-blue-600'>Login</span>
        </div>

        <div className="flex items-center justify-center">
          <div className="h-px bg-gray-300 w-1/4"></div>
          <span className="text-gray-500 text-sm mx-3">or</span>
          <div className="h-px bg-gray-300 w-1/4"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex items-center justify-center gap-2 w-full border border-gray-300
             hover:bg-gray-50 rounded-lg py-2 transition text-gray-700"
        >
          <Image
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt=""
            width={18}
            height={18}
          />
          Continue with Google
        </button>
      </div>
    </motion.div>
  </div>
);
}
