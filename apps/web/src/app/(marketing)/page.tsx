"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { 
  Bot, 
  Store, 
  Clock, 
  CalendarClock,
  ArrowRight
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col w-full text-stone-900 dark:text-stone-50 overflow-hidden">
      
      {/* HERO SECTION */}
      <section className="relative bg-background">
        <div className="absolute inset-0 bg-[#0f1115] bg-[radial-gradient(ellipse_20%_50%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))] dark:block hidden pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 relative z-10 flex flex-col items-center text-center">
          
          <motion.h1 
            className="max-w-4xl text-5xl font-bold tracking-tight sm:text-7xl mb-6 bg-clip-text text-transparent bg-gradient-to-r from-stone-900 to-stone-500 dark:from-white dark:to-stone-400"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            The intelligent operating system for modern kitchens.
          </motion.h1>
          
          <motion.p 
            className="max-w-2xl text-lg leading-8 text-stone-600 dark:text-stone-300 mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          >
            Sous eliminates scheduling chaos, auto-optimizes labor costs, and seamlessly scales multi-location kitchen operations using advanced AI constraints.
          </motion.p>
          
          <motion.div 
            className="flex items-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
          >
            <Button size="lg" className="rounded-full shadow-lg" asChild>
              <Link href="/sign-up">Start for free</Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-full bg-background/50 backdrop-blur-sm shadow-sm" asChild>
              <Link href="/features">Explore features</Link>
            </Button>
          </motion.div>
          
          <motion.div 
            className="mt-16 w-full max-w-5xl rounded-2xl p-2 bg-gradient-to-b from-stone-200 to-stone-100 dark:from-white/10 dark:to-white/5 border border-stone-200 dark:border-white/10 shadow-2xl relative"
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.6 }}
          >
            <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden shadow-inner bg-stone-900">
              <Image 
                src="/images/marketing/hero-v2.png" 
                alt="High-tech futuristic kitchen interface"
                fill
                priority
                className="object-cover transition-transform duration-1000 hover:scale-[1.02]"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="py-24 bg-stone-50 dark:bg-[#0a0a0c]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div 
            className="mx-auto max-w-2xl lg:text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-base font-semibold leading-7 text-stone-500 dark:text-stone-400">Faster, Smarter, Better</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-stone-900 dark:text-white">
              Everything you need to orchestrate the back of house.
            </p>
          </motion.div>
          <div className="mx-auto max-w-2xl lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-4">
              {[
                {
                  name: "AI Auto-Scheduling",
                  description: "Solve complex labor requirements using constraints logic to generate optimal schedules in seconds.",
                  icon: Bot,
                },
                {
                  name: "Multi-Location Native",
                  description: "Manage global managers, staff, and shifts efficiently across one or one thousand kitchens seamlessly.",
                  icon: Store,
                },
                {
                  name: "Time-Off Management",
                  description: "Employees can submit time off directly; the scheduler engine automatically routes around missing staff.",
                  icon: CalendarClock,
                },
                {
                  name: "Cost Optimization",
                  description: "Fine-tune cost weights versus employee preferences to always keep labor margins highly profitable.",
                  icon: Clock,
                },
              ].map((feature, idx) => (
                <motion.div 
                  key={feature.name} 
                  className="flex flex-col items-center lg:items-start lg:text-left text-center"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: idx * 0.15 }}
                >
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm">
                    <feature.icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <dt className="text-lg font-semibold leading-7 text-stone-900 dark:text-white">
                    {feature.name}
                  </dt>
                  <dd className="mt-2 flex flex-auto flex-col text-base leading-7 text-stone-600 dark:text-stone-400">
                    <p className="flex-auto">{feature.description}</p>
                  </dd>
                </motion.div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* TWO COLUMN FEATURE SHOWCASE */}
      <section className="py-24 bg-background overflow-hidden relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          
          {/* Feature 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-32">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6 text-stone-900 dark:text-white">
                The constraint-based AI engine.
              </h2>
              <p className="text-lg text-stone-600 dark:text-stone-400 mb-8">
                Sous relies on an advanced CP-SAT solver built into the cloud. It perfectly balances business requirements, fair shift distribution, labor costs, and staff time-off limits so you never have to play sudoku with spreadsheets again.
              </p>
              <Button variant="link" className="p-0 h-auto text-stone-900 dark:text-white font-semibold" asChild>
                <Link href="/features" className="flex items-center gap-1 group">
                  See how it works <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </motion.div>
            
            <motion.div 
              className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-2xl p-1 bg-gradient-to-tr from-stone-200 to-stone-100 dark:from-white/10 dark:to-transparent border border-white/5"
              initial={{ opacity: 0, scale: 0.9, x: 50 }}
              whileInView={{ opacity: 1, scale: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            >
              <div className="relative w-full h-full rounded-xl overflow-hidden bg-stone-950">
                <Image 
                  src="/images/marketing/feature-scheduling-v2.png" 
                  alt="AI Scheduling Node Network"
                  fill
                  className="object-cover opacity-90 transition-transform duration-1000 hover:scale-105"
                />
              </div>
            </motion.div>
          </div>

          {/* Feature 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center lg:flex-row-reverse">
            <motion.div 
              className="lg:order-last"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6 text-stone-900 dark:text-white">
                Synchronized across all your locations.
              </h2>
              <p className="text-lg text-stone-600 dark:text-stone-400 mb-8">
                Designed for franchises and rapid-growth restaurant groups, our B2B architecture lets you invite managers and restrict their access purely to their own kitchen, while giving owners a bird&apos;s-eye view of everything from a single pane of glass.
              </p>
              <Button variant="link" className="p-0 h-auto text-stone-900 dark:text-white font-semibold" asChild>
                <Link href="/features" className="flex items-center gap-1 group">
                  Explore Enterprise scale <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </motion.div>

            <motion.div 
              className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-2xl p-1 bg-gradient-to-bl from-stone-200 to-stone-100 dark:from-white/10 dark:to-transparent border border-white/5 lg:order-first"
              initial={{ opacity: 0, scale: 0.9, x: -50 }}
              whileInView={{ opacity: 1, scale: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            >
               <div className="relative w-full h-full rounded-xl overflow-hidden bg-stone-950">
                <Image 
                  src="/images/marketing/feature-sync-v2.png" 
                  alt="Global multi-location synchronization"
                  fill
                  className="object-cover opacity-90 hover:scale-105 transition-transform duration-1000"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="py-24 bg-stone-900 dark:bg-stone-50 overflow-hidden relative xl:mx-10 mb-12 lg:rounded-3xl shadow-xl">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
        <motion.div 
          className="relative mx-auto max-w-4xl text-center z-10 px-6"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h2 className="text-3xl font-bold tracking-tight text-white dark:text-stone-900 sm:text-5xl mb-6">
            Ready to stop playing guessing games with your schedule?
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-stone-300 dark:text-stone-600 mb-10">
            Join the hundreds of modern kitchens using Sous to radically reduce labor costs and increase employee satisfaction.
          </p>
          <div className="flex items-center justify-center gap-x-6">
            <Button size="lg" className="bg-white text-stone-900 hover:bg-stone-100 dark:bg-stone-900 dark:text-white dark:hover:bg-stone-800 rounded-full" asChild>
              <Link href="/sign-up">Start your 14-day free trial</Link>
            </Button>
            <Button variant="link" className="text-white dark:text-stone-900 hover:text-stone-300 dark:hover:text-stone-600" asChild>
              <Link href="/pricing">View our plans</Link>
            </Button>
          </div>
        </motion.div>
      </section>
      
    </div>
  );
}
