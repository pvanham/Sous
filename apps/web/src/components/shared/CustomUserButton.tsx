"use client";

import { useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, LogOut, Settings, User } from "lucide-react";
import { ProfileImageDialog } from "./ProfileImageDialog";

export function CustomUserButton() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [imageDialogOpen, setImageDialogOpen] = useState(false);

  if (!isLoaded || !user) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
    );
  }

  const handleSignOut = async () => {
    await signOut({ redirectUrl: "/" });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="outline-none ring-0 focus:ring-0">
          <Avatar className="h-9 w-9 border border-stone-200 dark:border-white/10 hover:opacity-80 transition-opacity">
            <AvatarImage src={user.imageUrl} alt={user.fullName || "User Avatar"} />
            <AvatarFallback className="bg-stone-900 text-stone-50 dark:bg-white dark:text-stone-900 font-semibold">
              {user.firstName?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-stone-950 border-stone-200 dark:border-white/10 shadow-lg">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none text-stone-900 dark:text-white">
                {user.fullName}
              </p>
              <p className="text-xs leading-none text-stone-500 dark:text-stone-400 truncate">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-stone-200 dark:bg-white/10" />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setImageDialogOpen(true);
            }}
            className="cursor-pointer focus:bg-stone-100 dark:focus:bg-white/5 focus:text-stone-900 dark:focus:text-white"
          >
            <Camera className="mr-2 h-4 w-4" />
            <span>Change profile picture</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer focus:bg-stone-100 dark:focus:bg-white/5 focus:text-stone-900 dark:focus:text-white">
            <Link href="/dashboard/settings" className="flex items-center w-full">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer focus:bg-stone-100 dark:focus:bg-white/5 focus:text-stone-900 dark:focus:text-white">
            <Link href="/dashboard" className="flex items-center w-full">
              <User className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-stone-200 dark:bg-white/10" />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/50 dark:focus:text-red-300"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileImageDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
      />
    </>
  );
}
