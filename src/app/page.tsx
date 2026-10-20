'use client'

import { SiteHeader } from "@/components/flare/header";
import { ApiKeyBar } from "@/components/flare/api-key-bar";
import { Generator } from "@/components/flare/generator";
import { McpConnect } from "@/components/flare/mcp-connect";
import { Results } from "@/components/flare/results";
import { Gallery } from "@/components/flare/gallery";
import { Lightbox } from "@/components/flare/lightbox";
import { SiteFooter } from "@/components/flare/footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <ApiKeyBar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(380px,440px)_1fr]">
          <div id="generator-panel" className="lg:sticky lg:top-20">
            <Generator />
          </div>
          <div className="space-y-8">
            <Results />
            <Gallery />
            <McpConnect />
          </div>
        </div>
      </main>

      <SiteFooter />
      <Lightbox />
    </div>
  )
}
