import { serializeAsJSON } from "@excalidraw/excalidraw"
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"

export type StoredBoard = {
  id: string
  name: string
  scene: string | null
  createdAt: string
  updatedAt: string
}

export type StoredProject = {
  id: string
  name: string
  boards: StoredBoard[]
  createdAt: string
  updatedAt: string
}

export type Workspace = {
  activeProjectId: string
  activeBoardId: string
  projects: StoredProject[]
}

const STORAGE_KEY = "draw-workspace-v1"

function now() {
  return new Date().toISOString()
}

function createId() {
  return crypto.randomUUID()
}

export function createBoard(name = "Board 1"): StoredBoard {
  const timestamp = now()

  return {
    id: createId(),
    name,
    scene: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createProject(name = "Project 1"): StoredProject {
  const timestamp = now()
  const board = createBoard()

  return {
    id: createId(),
    name,
    boards: [board],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createWorkspace(): Workspace {
  const project = createProject("My first project")

  return {
    activeProjectId: project.id,
    activeBoardId: project.boards[0].id,
    projects: [project],
  }
}

export function normalizeWorkspace(input: unknown): Workspace {
  if (!input || typeof input !== "object") {
    return createWorkspace()
  }

  const parsed = input as Partial<Workspace>
  if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) {
    return createWorkspace()
  }

  const projects = parsed.projects
    .map((project, projectIndex) => {
      const safeBoards = Array.isArray(project.boards) ? project.boards : []
      const boards = safeBoards.length
        ? safeBoards.map((board, boardIndex) => ({
            id: typeof board.id === "string" ? board.id : createId(),
            name:
              typeof board.name === "string" && board.name.trim().length > 0
                ? board.name
                : `Board ${boardIndex + 1}`,
            scene: typeof board.scene === "string" ? board.scene : null,
            createdAt:
              typeof board.createdAt === "string" ? board.createdAt : now(),
            updatedAt:
              typeof board.updatedAt === "string" ? board.updatedAt : now(),
          }))
        : [createBoard("Board 1")]

      return {
        id: typeof project.id === "string" ? project.id : createId(),
        name:
          typeof project.name === "string" && project.name.trim().length > 0
            ? project.name
            : `Project ${projectIndex + 1}`,
        boards,
        createdAt:
          typeof project.createdAt === "string" ? project.createdAt : now(),
        updatedAt:
          typeof project.updatedAt === "string" ? project.updatedAt : now(),
      }
    })
    .filter((project) => project.boards.length > 0)

  if (projects.length === 0) {
    return createWorkspace()
  }

  const activeProject =
    projects.find((project) => project.id === parsed.activeProjectId) ?? projects[0]
  const activeBoard =
    activeProject.boards.find((board) => board.id === parsed.activeBoardId) ??
    activeProject.boards[0]

  return {
    activeProjectId: activeProject.id,
    activeBoardId: activeBoard.id,
    projects,
  }
}

export function loadWorkspace(): Workspace {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return createWorkspace()
    }

    return normalizeWorkspace(JSON.parse(stored))
  } catch {
    return createWorkspace()
  }
}

export function persistWorkspace(workspace: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
}

export function createSceneSnapshot(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles
) {
  return serializeAsJSON(elements, appState, files, "local")
}

export function parseSceneSnapshot(scene: string | null): ImportedDataState | null {
  if (!scene) {
    return null
  }

  try {
    return JSON.parse(scene) as ImportedDataState
  } catch {
    return null
  }
}
