import type { Prisma } from "@prisma/client";

// Formas compartidas del módulo de planificación (sectores, sub-secciones, tareas).
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
  sectionId:    string;
  sectorId:     string;          // derivado de la sección; el DTO lo aplana para el cliente
  company:      string | null;
  weeklyPlanId: string | null;
  sortOrder:    number;
  completedAt:  string | null;
  createdAt:    string;
  updatedAt:    string;
  assignee:     TaskUser | null;  // opcional: es una etiqueta, no un permiso
  createdBy:    TaskUser;
  commentCount: number;
}

export interface SectionDTO {
  id:        string;
  name:      string;
  sortOrder: number;
}

export interface SectorDTO {
  id:          string;
  name:        string;
  description: string | null;
  isGeneral:   boolean;
  sortOrder:   number;
  members:     TaskUser[];
  sections:    SectionDTO[];
  /** true si la sesión actual puede escribir acá. Lo calcula el servidor, no el cliente. */
  canWrite:    boolean;
}

export interface SectorsPayload {
  sectors: SectorDTO[];
  isAdmin: boolean;
}

export interface TasksPayload {
  /** TODAS las tareas visibles: la lectura es abierta a cualquier autenticado. */
  tasks: TaskDTO[];
}

const USER_SELECT = { id: true, name: true, email: true, initials: true } as const;

export const TASK_INCLUDE = {
  assignee:  { select: USER_SELECT },
  createdBy: { select: USER_SELECT },
  // Se trae el sectorId de la sección para poder aplanarlo en el DTO y, sobre todo,
  // para resolver permisos sin una segunda consulta.
  section:   { select: { id: true, sectorId: true } },
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
    sectionId:    t.sectionId,
    sectorId:     t.section.sectorId,
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

export const SECTOR_INCLUDE = {
  members:  { include: { user: { select: USER_SELECT } } },
  sections: { orderBy: { sortOrder: "asc" } },
} as const;
