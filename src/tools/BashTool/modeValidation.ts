import type { z } from 'zod/v4'
import type { ToolPermissionContext } from '../../Tool.js'
import { splitCommand_DEPRECATED } from '../../utils/bash/commands.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import type { BashTool } from './BashTool.js'

const ACCEPT_EDITS_ALLOWED_COMMANDS = [
  'mkdir',
  'touch',
  'rm',
  'rmdir',
  'mv',
  'cp',
  'sed',
] as const

type FilesystemCommand = (typeof ACCEPT_EDITS_ALLOWED_COMMANDS)[number]

function isFilesystemCommand(command: string): command is FilesystemCommand {
  return ACCEPT_EDITS_ALLOWED_COMMANDS.includes(command as FilesystemCommand)
}

function validateCommandForMode(
  cmd: string,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  const trimmedCmd = cmd.trim()
  const [baseCmd] = trimmedCmd.split(/\s+/)

  if (!baseCmd) {
    return {
      behavior: 'passthrough',
      message: 'Base command not found',
    }
  }

  // In Accept Edits mode, auto-allow filesystem operations
  if (
    toolPermissionContext.mode === 'acceptEdits' &&
    isFilesystemCommand(baseCmd)
  ) {
    return {
      behavior: 'allow',
      updatedInput: { command: cmd },
      decisionReason: {
        type: 'mode',
        mode: 'acceptEdits',
      },
    }
  }

  return {
    behavior: 'passthrough',
    message: `No mode-specific handling for '${baseCmd}' in ${toolPermissionContext.mode} mode`,
  }
}

/**
 * Checks if commands should be handled differently based on the current permission mode
 * 检查命令是否应根据当前权限模式进行不同的处理
 *
 * This is the main entry point for mode-based permission logic.
 * 这是基于模式的权限逻辑的主入口点。
 * Currently handles Accept Edits mode for filesystem commands,
 * 目前处理 Accept Edits 模式下的文件系统命令，
 * but designed to be extended for other modes.
 * 但设计为可扩展到其他模式。
 *
 * @param input - The bash command input / bash 命令输入
 * @param toolPermissionContext - Context containing mode and permissions / 包含模式和权限的上下文
 * @returns
 * - 'allow' if the current mode permits auto-approval / 如果当前模式允许自动批准
 * - 'ask' if the command needs approval in current mode / 如果命令在当前模式下需要审批
 * - 'passthrough' if no mode-specific handling applies / 如果没有模式特定的处理适用
 */
export function checkPermissionMode(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  // Skip if in bypass mode (handled elsewhere)
  // 在绕过模式下跳过（在其他地方处理）
  if (toolPermissionContext.mode === 'bypassPermissions') {
    return {
      behavior: 'passthrough',
      message: 'Bypass mode is handled in main permission flow',
    }
  }

  // Skip if in dontAsk mode (handled in main permission flow)
  if (toolPermissionContext.mode === 'dontAsk') {
    return {
      behavior: 'passthrough',
      message: 'DontAsk mode is handled in main permission flow',
    }
  }

  const commands = splitCommand_DEPRECATED(input.command)

  // Check each subcommand
  for (const cmd of commands) {
    const result = validateCommandForMode(cmd, toolPermissionContext)

    // If any command triggers mode-specific behavior, return that result
    if (result.behavior !== 'passthrough') {
      return result
    }
  }

  // No mode-specific handling needed
  return {
    behavior: 'passthrough',
    message: 'No mode-specific validation required',
  }
}

export function getAutoAllowedCommands(
  mode: ToolPermissionContext['mode'],
): readonly string[] {
  return mode === 'acceptEdits' ? ACCEPT_EDITS_ALLOWED_COMMANDS : []
}
