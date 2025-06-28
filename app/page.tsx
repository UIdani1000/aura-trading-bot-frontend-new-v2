"use client"
import React from "react"
import { FirebaseProvider } from '@/components/FirebaseProvider';

function TestDashboardContent() {
  return (
    <div className="flex">Hello Aura!</div>
  )
}
export default function TradingDashboardWrapper() { return (<FirebaseProvider><TestDashboardContent /></FirebaseProvider>); }