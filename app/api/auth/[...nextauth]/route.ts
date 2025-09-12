// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/options";

export const runtime = "nodejs"; // 安定運用のため nodejs を明示

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
