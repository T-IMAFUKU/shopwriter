import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows = await db.template.findMany({ select:{id:true,title:true}, take:10, orderBy:{createdAt:"desc"} });
console.log(JSON.stringify(rows,null,2));
await db.$disconnect();