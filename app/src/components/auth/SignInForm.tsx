'use client'

import { motion } from 'framer-motion'
import { HeartIcon } from '@heroicons/react/24/solid'
import { signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import Image from 'next/image'
import { useAuthStore } from '@/stores/authStore'
import { LoginData } from '@/types/api'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'


export function SignInForm() {
  const { register, handleSubmit } = useForm<LoginData>()
  const { isLoading, setLoading, setError, error } = useAuthStore()

  const router = useRouter();

  const onSubmit = async (data: LoginData) => {
     try {
      setError(null)
      setLoading(true)

      const loginResult = await signIn('credentials', {
        redirect: false,
        email: data.email,
        password: data.password,
        callbackUrl: '/', 
      })

      if (loginResult?.error) {
        setError('Invalid email or password')
      } else {
        router.push('/')
      }
    } catch (err) {
      console.error(err)
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  };

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
        w-1/2 relative bg-linear-to-br from-sky-100 via-sky-200
         to-sky-300 text-white overflow-hidden"
      >

        <div className="flex items-center mb-2">
          <h1 className="text-3xl font-semibold tracking-tight text-sky-900 ml-0.5">
            MediFact
          </h1>
        </div>


        <div className=" text-sky-800 max-w-md text-center leading-relaxed">
          <p>Empowering healthinfo through AI</p>
          <p>Log in to continue</p>
        </div>

        <svg
          className="absolute bottom-0 left-0 w-full opacity-40"
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
            <h2 className="text-3xl font-semibold text-gray-500">
              Sign in to your account
            </h2>
            <p className="mt-2 text-gray-500">
              Use your email and password or continue with Google.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="">
            <div className="mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                {...register("email")}
                required
                className="mt-2 block w-full rounded-lg border border-gray-300 px-4 
                py-2 focus:border-sky-500 focus:ring-sky-500 outline-none text-gray-700"
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
                type="password"
                {...register("password")}
                required
                className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-2 
                focus:border-sky-500 focus:ring-sky-500 outline-none text-gray-700"
              />
            </div>

            {error && <p className="text-red-800">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium 
              py-2 mt-2 rounded-lg transition"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="flex items-center justify-center">
            <div className="h-px bg-gray-300 w-1/4"></div>
            <span className="text-gray-500 text-sm mx-3">or</span>
            <div className="h-px bg-gray-300 w-1/4"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="flex items-center justify-center gap-2 w-full border border-gray-300
             hover:bg-gray-50 rounded-lg py-2 transition text-sky-600 "
          >
            <Image
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt=""
              width={18}
              height={18}
            />
            Continue with Google
          </button>

          <div className="flex items-center justify-center">
            <div className="h-px bg-gray-300 w-1/4"></div>
            <span className="text-gray-500 text-sm mx-3">or</span>
            <div className="h-px bg-gray-300 w-1/4"></div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="w-full text-center text-gray-600 hover:text-sky-600 py-2 
              rounded-lg transition text-sm font-medium"
          >
            Continue as guest
          </button>

          <button
            className="text-center w-full text-gray-700 cursor-pointer
           hover:text-blue-600 transition-colors"
            onClick={() => router.push("/register")}
          >
            Create an account?
          </button>
        </div>
      </motion.div>
    </div>
  );
}
