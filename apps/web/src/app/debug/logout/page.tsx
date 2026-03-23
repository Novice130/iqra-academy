"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    authClient.signOut().then(() => {
      window.location.href = "/login";
    });
  }, [router]);

  return <div className="p-10 text-center">Forcing logout...</div>;
}
