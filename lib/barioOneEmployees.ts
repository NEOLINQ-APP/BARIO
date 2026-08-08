import type { BoEmployee, BoMembership, BoOrganization } from '@/lib/db'

// Shared by both clock-in and clock-out — an explicit employeeId (an
// owner/admin clocking someone in on a shared device) takes priority;
// otherwise falls back to the caller's own linked bo_employee record
// (self clock-in), so a plain employee-role member can only ever clock
// themselves in/out, never someone else, without a separate check.
export async function resolveEmployeeForClockAction(
  sql: any,
  org: BoOrganization,
  membership: BoMembership,
  requestedEmployeeId: string | undefined
): Promise<{ employee: BoEmployee } | { error: string; status: number }> {
  if (requestedEmployeeId) {
    if (membership.role === 'employee') return { error: 'Only owners and admins can clock in another employee', status: 403 }
    const rows = (await sql`SELECT * FROM bo_employees WHERE id = ${requestedEmployeeId} AND organization_id = ${org.id}`) as unknown as BoEmployee[]
    if (!rows[0]) return { error: 'Employee not found', status: 404 }
    return { employee: rows[0] }
  }
  const rows = (await sql`SELECT * FROM bo_employees WHERE user_id = ${membership.user_id} AND organization_id = ${org.id}`) as unknown as BoEmployee[]
  if (!rows[0]) return { error: 'No employee record is linked to your account — ask an admin to link one', status: 400 }
  return { employee: rows[0] }
}
