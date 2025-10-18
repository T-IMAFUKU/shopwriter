"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { NavigationMenu, NavigationMenuItem, NavigationMenuList } from "@/components/ui/navigation-menu"

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">ShopWriter</Link>
        <NavigationMenu>
          <NavigationMenuList className="gap-2">
            <NavigationMenuItem>
              <Link href="/writer" className="px-3 py-2 text-sm font-medium hover:underline">譁・ｫ逕滓・</Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/dashboard" className="px-3 py-2 text-sm font-medium hover:underline">繝繝・す繝･繝懊・繝・/Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/docs" className="px-3 py-2 text-sm font-medium hover:underline">繝峨く繝･繝｡繝ｳ繝・/Link>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary"><Link href="/api/auth/signin">繧ｵ繧､繝ｳ繧､繝ｳ</Link></Button>
          <Button asChild><Link href="/writer">辟｡譁吶〒隧ｦ縺・/Link></Button>
        </div>
      </div>
    </header>
  )
}


