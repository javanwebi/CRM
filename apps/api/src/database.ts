import { PrismaClient } from "@prisma/client";
export interface Executor {
  query<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<T[]>;
}
export interface Database extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
}
export function database(): Database {
  const prisma = new PrismaClient();
  const wrap = (p: Pick<PrismaClient, "$queryRawUnsafe">): Executor => ({
    query: async <T>(sql: string, values: unknown[] = []) =>
      p.$queryRawUnsafe<T[]>(sql, ...values),
  });
  return {
    ...wrap(prisma),
    transaction: (fn) =>
      prisma.$transaction((tx) => fn(wrap(tx)), { timeout: 15000 }),
  };
}
export async function scoped<T>(
  db: Database,
  user: string,
  fn: (tx: Executor) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.user_id',$1,true)", [user]);
    await tx.query("SET LOCAL ROLE crm_runtime");
    return fn(tx);
  });
}
