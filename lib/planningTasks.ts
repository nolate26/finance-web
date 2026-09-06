import type { Prisma } from "@prisma/client";

// Forma compartida de una tarea entre las rutas del Analyst Grid.
//
// Vive en lib/ y no en el route handler porque Next.js sólo deja exportar los verbos
// HTTP y su config desde un app/api/**/route.ts: un `export const` ahí rompe el build.
// Los `export interface` sí se permiten (se borran al compilar), pero se dejan acá
// para que el DTO y el include que lo produce no se separen nunca.

export interface TaskUser {
  id:       string;
  name:     string | null;
  email:    string | null;
  initials: string | null;
}

export interface TaskDTO {
  id:           string;
  title:        string;
  description:  string | null;
  status:       string;
  priority:     string;
  dueDate:      string | null;   // ISO date, sin hora
  region:       string | null;
  company:      string | null;
  weeklyPlanId: string | null;
  sortOrder:    number;
  completedAt:  string | null;
  createdAt:    string;
  updatedAt:    string;
  assignee:     TaskUser;
  createdBy:    TaskUser;
  commentCount: number;
}

export interface TasksPayload {
  tasks:     TaskDTO[];
  /** true si la sesión es admin: el filtro por analista sólo aplica en ese caso. */
  canSeeAll: boolean;
}

const USER_SELECT = { id: true, name: true, email: true, initials: true } as const;

export const TASK_INCLUDE = {
  assignee:  { select: USER_SELECT },
  createdBy: { select: USER_SELECT },
  _count:    { select: { comments: true } },
} as const;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

export function toTaskDTO(t: TaskRow): TaskDTO {
  return {
    id:           t.id,
    title:        t.title,
    description:  t.description,
    status:       t.status,
    priority:     t.priority,
    dueDate:      t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    region:       t.region,
    company:      t.company,
    weeklyPlanId: t.weeklyPlanId,
    sortOrder:    t.sortOrder,
    completedAt:  t.completedAt?.toISOString() ?? null,
    createdAt:    t.createdAt.toISOString(),
    updatedAt:    t.updatedAt.toISOString(),
    assignee:     t.assignee,
    createdBy:    t.createdBy,
    commentCount: t._count.comments,
  };
}
