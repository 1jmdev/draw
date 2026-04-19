import { startTransition, useEffect, useRef, useState } from "react"
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import "@excalidraw/excalidraw/index.css"
import { Plus, Pencil, Trash2 } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import {
  createBoard,
  createProject,
  createSceneSnapshot,
  loadWorkspace,
  normalizeWorkspace,
  parseSceneSnapshot,
  persistWorkspace,
  type Workspace,
} from "@/lib/workspace-storage"
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

const SAVE_DELAY_MS = 450

type PendingSave = {
  projectId: string
  boardId: string
  scene: string
}

type CanvasTheme = "dark" | "light"

type EditModalState =
  | { type: "project"; id: string; name: string }
  | { type: "board"; id: string; name: string }
  | null

type CreateModalState =
  | { type: "project" }
  | { type: "board" }
  | null

function getThemeValue(theme: string): CanvasTheme {
  return theme === "dark" ? "dark" : "light"
}

function getEmptyBoardData(boardName: string, theme: CanvasTheme): ImportedDataState {
  return {
    elements: [],
    appState: {
      name: boardName,
      theme,
      viewBackgroundColor: theme === "dark" ? "#0f172a" : "#ffffff",
      showWelcomeScreen: false,
    },
    scrollToContent: true,
  }
}

function getBoardData(boardName: string, scene: string | null, theme: CanvasTheme) {
  const parsed = parseSceneSnapshot(scene)
  if (!parsed) return getEmptyBoardData(boardName, theme)
  return {
    ...parsed,
    appState: {
      ...parsed.appState,
      name: boardName,
      theme,
      showWelcomeScreen: false,
    },
  } satisfies ImportedDataState
}

export function App() {
  const { theme, setTheme } = useTheme()
  const resolvedTheme = getThemeValue(theme)
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace())
  const [editModal, setEditModal] = useState<EditModalState>(null)
  const [editName, setEditName] = useState("")
  const [createModal, setCreateModal] = useState<CreateModalState>(null)
  const [createName, setCreateName] = useState("")
  const saveTimeoutRef = useRef<number | null>(null)
  const pendingSaveRef = useRef<PendingSave | null>(null)

  const activeProject =
    workspace.projects.find((p) => p.id === workspace.activeProjectId) ??
    workspace.projects[0]
  const activeBoard =
    activeProject.boards.find((b) => b.id === workspace.activeBoardId) ??
    activeProject.boards[0]

  function writeWorkspace(nextWorkspace: Workspace) {
    const n = normalizeWorkspace(nextWorkspace)
    persistWorkspace(n)
    setWorkspace(n)
  }

  function updateWorkspace(updater: (current: Workspace) => Workspace) {
    setWorkspace((current) => {
      const next = normalizeWorkspace(updater(current))
      persistWorkspace(next)
      return next
    })
  }

  function flushPendingSave() {
    const pendingSave = pendingSaveRef.current
    if (!pendingSave) return
    pendingSaveRef.current = null
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    updateWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => {
        if (project.id !== pendingSave.projectId) return project
        const updatedAt = new Date().toISOString()
        return {
          ...project,
          updatedAt,
          boards: project.boards.map((board) =>
            board.id === pendingSave.boardId
              ? { ...board, scene: pendingSave.scene, updatedAt }
              : board
          ),
        }
      }),
    }))
  }

  function queueSave(scene: string) {
    pendingSaveRef.current = {
      projectId: activeProject.id,
      boardId: activeBoard.id,
      scene,
    }
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => flushPendingSave(), SAVE_DELAY_MS)
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  function openCreateProject() {
    setCreateName(`Project ${workspace.projects.length + 1}`)
    setCreateModal({ type: "project" })
  }

  function openCreateBoard() {
    setCreateName(`Board ${activeProject.boards.length + 1}`)
    setCreateModal({ type: "board" })
  }

  function submitCreate() {
    const name = createName.trim()
    if (!name) { setCreateModal(null); return }

    flushPendingSave()
    if (createModal?.type === "project") {
      const project = createProject(name)
      updateWorkspace((current) => ({
        activeProjectId: project.id,
        activeBoardId: project.boards[0].id,
        projects: [...current.projects, project],
      }))
    } else if (createModal?.type === "board") {
      const board = createBoard(name)
      updateWorkspace((current) => ({
        ...current,
        activeProjectId: activeProject.id,
        activeBoardId: board.id,
        projects: current.projects.map((p) =>
          p.id === activeProject.id
            ? { ...p, updatedAt: new Date().toISOString(), boards: [...p.boards, board] }
            : p
        ),
      }))
    }
    setCreateModal(null)
    setCreateName("")
  }

  // ── Edit / Rename ──────────────────────────────────────────────────────────

  function openEditProject(id: string, name: string) {
    setEditName(name)
    setEditModal({ type: "project", id, name })
  }

  function openEditBoard(id: string, name: string) {
    setEditName(name)
    setEditModal({ type: "board", id, name })
  }

  function submitRename() {
    const name = editName.trim()
    if (!name || !editModal) { setEditModal(null); return }
    flushPendingSave()
    if (editModal.type === "project") {
      updateWorkspace((current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === editModal.id
            ? { ...p, name, updatedAt: new Date().toISOString() }
            : p
        ),
      }))
    } else {
      updateWorkspace((current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === activeProject.id
            ? {
                ...p,
                updatedAt: new Date().toISOString(),
                boards: p.boards.map((b) =>
                  b.id === editModal.id
                    ? { ...b, name, updatedAt: new Date().toISOString() }
                    : b
                ),
              }
            : p
        ),
      }))
    }
    setEditModal(null)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  function handleDeleteFromModal() {
    if (!editModal) return
    flushPendingSave()

    if (editModal.type === "project") {
      if (workspace.projects.length === 1) return
      const remaining = workspace.projects.filter((p) => p.id !== editModal.id)
      const fallback = remaining[0]
      const isActive = editModal.id === activeProject.id
      writeWorkspace({
        activeProjectId: isActive ? fallback.id : workspace.activeProjectId,
        activeBoardId: isActive ? fallback.boards[0].id : workspace.activeBoardId,
        projects: remaining,
      })
    } else {
      if (activeProject.boards.length === 1) return
      const remaining = activeProject.boards.filter((b) => b.id !== editModal.id)
      const fallback = remaining[0]
      const nextBoardId = editModal.id === activeBoard.id ? fallback.id : workspace.activeBoardId
      updateWorkspace((current) => ({
        ...current,
        activeProjectId: activeProject.id,
        activeBoardId: nextBoardId,
        projects: current.projects.map((p) =>
          p.id === activeProject.id
            ? { ...p, updatedAt: new Date().toISOString(), boards: remaining }
            : p
        ),
      }))
    }
    setEditModal(null)
  }

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current)
      if (pendingSaveRef.current) {
        persistWorkspace(
          normalizeWorkspace({
            ...workspace,
            projects: workspace.projects.map((project) => {
              if (project.id !== pendingSaveRef.current?.projectId) return project
              const updatedAt = new Date().toISOString()
              return {
                ...project,
                updatedAt,
                boards: project.boards.map((board) =>
                  board.id === pendingSaveRef.current?.boardId
                    ? { ...board, scene: pendingSaveRef.current?.scene ?? board.scene, updatedAt }
                    : board
                ),
              }
            }),
          })
        )
      }
    }
  }, [workspace])

  const initialData = getBoardData(activeBoard.name, activeBoard.scene, resolvedTheme)

  const isEditDeleteDisabled =
    editModal?.type === "project"
      ? workspace.projects.length <= 1
      : activeProject.boards.length <= 1

  return (
    <>
      <div style={{ position: "fixed", inset: 0 }}>
        <Excalidraw
          key={`${activeProject.id}:${activeBoard.id}`}
          initialData={initialData}
          theme={resolvedTheme}
          name={activeBoard.name}
          onChange={(elements, appState, files) => {
            queueSave(createSceneSnapshot(elements, appState, files))
          }}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: {},
              clearCanvas: true,
              toggleTheme: false,
              saveAsImage: true,
            },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />

            <MainMenu.Group title="Workspace">
              {/* Projects header */}
              <MainMenu.ItemCustom>
                <div className="workspace-section-header">
                  <span className="workspace-section-label">Projects</span>
                  <button
                    type="button"
                    onClick={openCreateProject}
                    className="workspace-icon-btn"
                    aria-label="New project"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </MainMenu.ItemCustom>

              {workspace.projects.map((project, i) => (
                <MainMenu.Item
                  key={project.id}
                  selected={project.id === activeProject.id}
                  onSelect={() => {
                    flushPendingSave()
                    startTransition(() => {
                      writeWorkspace({
                        ...workspace,
                        activeProjectId: project.id,
                        activeBoardId: project.boards[0].id,
                      })
                    })
                  }}
                >
                  <div
                    className="workspace-item"
                    style={{ marginTop: i > 0 ? "2px" : undefined }}
                  >
                    <span className="workspace-item-name">{project.name}</span>
                    <button
                      type="button"
                      aria-label={`Edit ${project.name}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditProject(project.id, project.name)
                      }}
                      className="workspace-edit-btn"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                </MainMenu.Item>
              ))}

              <MainMenu.Separator />

              {/* Boards header */}
              <MainMenu.ItemCustom>
                <div className="workspace-section-header">
                  <span className="workspace-section-label">Boards in project</span>
                  <button
                    type="button"
                    onClick={openCreateBoard}
                    className="workspace-icon-btn"
                    aria-label="New board"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </MainMenu.ItemCustom>

              {activeProject.boards.map((board, i) => (
                <MainMenu.Item
                  key={board.id}
                  selected={board.id === activeBoard.id}
                  onSelect={() => {
                    flushPendingSave()
                    startTransition(() => {
                      writeWorkspace({ ...workspace, activeBoardId: board.id })
                    })
                  }}
                >
                  <div
                    className="workspace-item"
                    style={{ marginTop: i > 0 ? "2px" : undefined }}
                  >
                    <span className="workspace-item-name">{board.name}</span>
                    <button
                      type="button"
                      aria-label={`Edit ${board.name}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditBoard(board.id, board.name)
                      }}
                      className="workspace-edit-btn"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                </MainMenu.Item>
              ))}
            </MainMenu.Group>

            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme
              allowSystemTheme
              theme={theme as any}
              onSelect={(t) => setTheme(t as any)}
            />
          </MainMenu>
        </Excalidraw>
      </div>

      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      <Dialog open={createModal !== null} onOpenChange={(open) => !open && setCreateModal(null)}>
        <DialogContent className="excali-dialog">
          <DialogHeader>
            <DialogTitle className="excali-dialog-title">
              {createModal?.type === "project" ? "New Project" : "New Board"}
            </DialogTitle>
            <DialogDescription className="excali-dialog-description">
              {createModal?.type === "project"
                ? "Create a new project to organise your boards."
                : "Add a new board to the current project."}
            </DialogDescription>
          </DialogHeader>

          <div className="excali-dialog-field">
            <Label htmlFor="create-name" className="excali-label">Name</Label>
            <Input
              id="create-name"
              className="excali-input"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitCreate() }}
              autoFocus
            />
          </div>

          <DialogFooter className="excali-dialog-footer">
            <Button variant="ghost" className="excali-btn-ghost" onClick={() => setCreateModal(null)}>
              Cancel
            </Button>
            <Button className="excali-btn-primary" onClick={submitCreate} disabled={!createName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ───────────────────────────────────────────────────── */}
      <Dialog open={editModal !== null} onOpenChange={(open) => !open && setEditModal(null)}>
        <DialogContent className="excali-dialog">
          <DialogHeader>
            <DialogTitle className="excali-dialog-title">
              {editModal?.type === "project" ? "Edit Project" : "Edit Board"}
            </DialogTitle>
            <DialogDescription className="excali-dialog-description">
              Rename or delete this {editModal?.type}.
            </DialogDescription>
          </DialogHeader>

          <div className="excali-dialog-field">
            <Label htmlFor="edit-name" className="excali-label">Name</Label>
            <Input
              id="edit-name"
              className="excali-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitRename() }}
              autoFocus
            />
          </div>

          <DialogFooter className="excali-dialog-footer excali-dialog-footer--split">
            <Button
              variant="ghost"
              className="excali-btn-danger"
              onClick={handleDeleteFromModal}
              disabled={isEditDeleteDisabled}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
            <div className="excali-dialog-footer-right">
              <Button variant="ghost" className="excali-btn-ghost" onClick={() => setEditModal(null)}>
                Cancel
              </Button>
              <Button
                className="excali-btn-primary"
                onClick={submitRename}
                disabled={!editName.trim()}
              >
                Rename
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default App