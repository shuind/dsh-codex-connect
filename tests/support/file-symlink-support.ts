import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Whether this process can create file symlinks (false on unprivileged Windows without Developer Mode). */
export const supportsFileSymlinks: boolean = (() => {
  if (process.platform !== 'win32') return true
  const root = mkdtempSync(join(tmpdir(), 'codex-symlink-probe-'))
  try {
    const target = join(root, 'target.txt')
    const link = join(root, 'link.txt')
    writeFileSync(target, 'ok')
    symlinkSync(target, link, 'file')
    return true
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'EPERM') return false
    return true
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})()
