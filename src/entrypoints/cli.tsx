#!/usr/bin/env bun
// Runtime polyfill for bun:bundle (build-time macros)
// bun:bundle 的运行时 polyfill（构建时宏的替代实现）
const feature = (_name: string) => false;
if (typeof globalThis.MACRO === "undefined") {
    (globalThis as any).MACRO = {
        VERSION: "2.1.888",
        BUILD_TIME: new Date().toISOString(),
        FEEDBACK_CHANNEL: "",
        ISSUES_EXPLAINER: "",
        NATIVE_PACKAGE_URL: "",
        PACKAGE_URL: "",
        VERSION_CHANGELOG: "",
    };
}
// Build-time constants — normally replaced by Bun bundler at compile time
// 构建时常量 — 通常由 Bun 打包器在编译时替换
(globalThis as any).BUILD_TARGET = "external";
(globalThis as any).BUILD_ENV = "production";
(globalThis as any).INTERFACE_TYPE = "stdio";

// Bugfix for corepack auto-pinning, which adds yarnpkg to peoples' package.jsons
// 修复 corepack 自动固定版本号的 bug，该 bug 会在 package.json 中添加 yarnpkg
// eslint-disable-next-line custom-rules/no-top-level-side-effects
process.env.COREPACK_ENABLE_AUTO_PIN = "0";

// Set max heap size for child processes in CCR environments (containers have 16GB)
// 为 CCR 环境中的子进程设置最大堆内存（容器通常有 16GB）
// eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level, custom-rules/safe-env-boolean-check
if (process.env.CLAUDE_CODE_REMOTE === "true") {
    // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
    const existing = process.env.NODE_OPTIONS || "";
    // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
    process.env.NODE_OPTIONS = existing
        ? `${existing} --max-old-space-size=8192`
        : "--max-old-space-size=8192";
}

// Harness-science L0 ablation baseline. Inlined here (not init.ts) because
// BashTool/AgentTool/PowerShellTool capture DISABLE_BACKGROUND_TASKS into
// module-level consts at import time — init() runs too late. feature() gate
// DCEs this entire block from external builds.
// 测试框架 L0 消融基线。内联在此处（而非 init.ts），因为 BashTool/AgentTool/PowerShellTool
// 在导入时就将 DISABLE_BACKGROUND_TASKS 捕获为模块级常量 — init() 运行太晚了。
// feature() 开关会在外部构建中通过死代码消除（DCE）移除整个代码块。
// eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
if (feature("ABLATION_BASELINE") && process.env.CLAUDE_CODE_ABLATION_BASELINE) {
    for (const k of [
        "CLAUDE_CODE_SIMPLE",
        "CLAUDE_CODE_DISABLE_THINKING",
        "DISABLE_INTERLEAVED_THINKING",
        "DISABLE_COMPACT",
        "DISABLE_AUTO_COMPACT",
        "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
        "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS",
    ]) {
        // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
        process.env[k] ??= "1";
    }
}

/**
 * Bootstrap entrypoint - checks for special flags before loading the full CLI.
 * All imports are dynamic to minimize module evaluation for fast paths.
 * Fast-path for --version has zero imports beyond this file.
 *
 * 引导入口点 — 在加载完整 CLI 之前检查特殊标志。
 * 所有导入都是动态的，以最小化快速路径的模块加载。
 * --version 的快速路径无需导入任何额外模块。
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);

    // Fast-path for --version/-v: zero module loading needed
    // --version/-v 的快速路径：无需加载任何模块
    if (
        args.length === 1 &&
        (args[0] === "--version" || args[0] === "-v" || args[0] === "-V")
    ) {
        // MACRO.VERSION is inlined at build time
        // MACRO.VERSION 在构建时内联
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${MACRO.VERSION} (Claude Code)`);
        return;
    }

    // For all other paths, load the startup profiler
    // 对于所有其他路径，加载启动性能分析器
    const { profileCheckpoint } = await import("../utils/startupProfiler.js");
    profileCheckpoint("cli_entry");

    // Fast-path for --dump-system-prompt: output the rendered system prompt and exit.
    // Used by prompt sensitivity evals to extract the system prompt at a specific commit.
    // Ant-only: eliminated from external builds via feature flag.
    // --dump-system-prompt 的快速路径：输出渲染后的系统提示词并退出。
    // 用于提示词敏感性评估，提取特定 commit 的系统提示词。
    // 仅限 Anthropic 内部：通过 feature flag 从外部构建中移除。
    if (feature("DUMP_SYSTEM_PROMPT") && args[0] === "--dump-system-prompt") {
        profileCheckpoint("cli_dump_system_prompt_path");
        const { enableConfigs } = await import("../utils/config.js");
        enableConfigs();
        const { getMainLoopModel } = await import("../utils/model/model.js");
        const modelIdx = args.indexOf("--model");
        const model =
            (modelIdx !== -1 && args[modelIdx + 1]) || getMainLoopModel();
        const { getSystemPrompt } = await import("../constants/prompts.js");
        const prompt = await getSystemPrompt([], model);
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(prompt.join("\n"));
        return;
    }

    // Claude in Chrome MCP server mode
    // Claude-in-Chrome MCP 服务端模式
    if (process.argv[2] === "--claude-in-chrome-mcp") {
        profileCheckpoint("cli_claude_in_chrome_mcp_path");
        const { runClaudeInChromeMcpServer } =
            await import("../utils/claudeInChrome/mcpServer.js");
        await runClaudeInChromeMcpServer();
        return;
    }

    // Chrome native messaging host mode
    // Chrome 原生消息宿主模式
    else if (process.argv[2] === "--chrome-native-host") {
        profileCheckpoint("cli_chrome_native_host_path");
        const { runChromeNativeHost } =
            await import("../utils/claudeInChrome/chromeNativeHost.js");
        await runChromeNativeHost();
        return;
    }

    // Computer Use MCP server mode (screen capture, mouse/keyboard control)
    // 计算机操作 MCP 服务端模式（截屏、鼠标键盘控制）
    else if (
        feature("CHICAGO_MCP") &&
        process.argv[2] === "--computer-use-mcp"
    ) {
        profileCheckpoint("cli_computer_use_mcp_path");
        const { runComputerUseMcpServer } =
            await import("../utils/computerUse/mcpServer.js");
        await runComputerUseMcpServer();
        return;
    }

    // Fast-path for `--daemon-worker=<kind>` (internal — supervisor spawns this).
    // Must come before the daemon subcommand check: spawned per-worker, so
    // perf-sensitive. No enableConfigs(), no analytics sinks at this layer —
    // workers are lean. If a worker kind needs configs/auth (assistant will),
    // it calls them inside its run() fn.
    // --daemon-worker=<kind> 的快速路径（内部使用 — 由 supervisor 派生）。
    // 必须在 daemon 子命令检查之前：每个 worker 单独派生，因此对性能敏感。
    // 此层不调用 enableConfigs() 或 analytics sinks — worker 是轻量级的。
    // 如果某个 worker 类型需要配置/认证（如 assistant），它在 run() 函数内部调用。
    if (feature("DAEMON") && args[0] === "--daemon-worker") {
        const { runDaemonWorker } = await import("../daemon/workerRegistry.js");
        await runDaemonWorker(args[1]);
        return;
    }

    // Fast-path for `claude remote-control` (also accepts legacy `claude remote` / `claude sync` / `claude bridge`):
    // serve local machine as bridge environment.
    // feature() must stay inline for build-time dead code elimination;
    // isBridgeEnabled() checks the runtime GrowthBook gate.
    // `claude remote-control` 的快速路径（也接受旧版 `claude remote` / `claude sync` / `claude bridge`）：
    // 将本地机器作为桥接环境提供服务。
    // feature() 必须保持内联以便构建时死代码消除；
    // isBridgeEnabled() 检查运行时 GrowthBook 开关。
    if (
        feature("BRIDGE_MODE") &&
        (args[0] === "remote-control" ||
            args[0] === "rc" ||
            args[0] === "remote" ||
            args[0] === "sync" ||
            args[0] === "bridge")
    ) {
        profileCheckpoint("cli_bridge_path");
        const { enableConfigs } = await import("../utils/config.js");
        enableConfigs();
        const { getBridgeDisabledReason, checkBridgeMinVersion } =
            await import("../bridge/bridgeEnabled.js");
        const { BRIDGE_LOGIN_ERROR } = await import("../bridge/types.js");
        const { bridgeMain } = await import("../bridge/bridgeMain.js");
        const { exitWithError } = await import("../utils/process.js");

        // Auth check must come before the GrowthBook gate check — without auth,
        // GrowthBook has no user context and would return a stale/default false.
        // getBridgeDisabledReason awaits GB init, so the returned value is fresh
        // (not the stale disk cache), but init still needs auth headers to work.
        // 认证检查必须在 GrowthBook 开关检查之前 — 没有认证，
        // GrowthBook 没有用户上下文，会返回过时/默认的 false。
        // getBridgeDisabledReason 等待 GB 初始化，所以返回值是最新的
        // （不是过时的磁盘缓存），但初始化仍需要认证头才能工作。
        const { getClaudeAIOAuthTokens } = await import("../utils/auth.js");
        if (!getClaudeAIOAuthTokens()?.accessToken) {
            exitWithError(BRIDGE_LOGIN_ERROR);
        }
        const disabledReason = await getBridgeDisabledReason();
        if (disabledReason) {
            exitWithError(`Error: ${disabledReason}`);
        }
        const versionError = checkBridgeMinVersion();
        if (versionError) {
            exitWithError(versionError);
        }

        // Bridge is a remote control feature - check policy limits
        // Bridge 是远程控制功能 — 检查策略限制
        const { waitForPolicyLimitsToLoad, isPolicyAllowed } =
            await import("../services/policyLimits/index.js");
        await waitForPolicyLimitsToLoad();
        if (!isPolicyAllowed("allow_remote_control")) {
            exitWithError(
                "Error: Remote Control is disabled by your organization's policy.",
            );
        }
        await bridgeMain(args.slice(1));
        return;
    }

    // Fast-path for `claude daemon [subcommand]`: long-running supervisor.
    // `claude daemon [子命令]` 的快速路径：长时间运行的守护进程。
    if (feature("DAEMON") && args[0] === "daemon") {
        profileCheckpoint("cli_daemon_path");
        const { enableConfigs } = await import("../utils/config.js");
        enableConfigs();
        const { initSinks } = await import("../utils/sinks.js");
        initSinks();
        const { daemonMain } = await import("../daemon/main.js");
        await daemonMain(args.slice(1));
        return;
    }

    // Fast-path for `claude ps|logs|attach|kill` and `--bg`/`--background`.
    // Session management against the ~/.claude/sessions/ registry. Flag
    // literals are inlined so bg.js only loads when actually dispatching.
    // `claude ps|logs|attach|kill` 和 `--bg`/`--background` 的快速路径。
    // 针对 ~/.claude/sessions/ 注册表的会话管理。标志字面量内联，
    // 这样 bg.js 只在实际调度时才加载。
    if (
        feature("BG_SESSIONS") &&
        (args[0] === "ps" ||
            args[0] === "logs" ||
            args[0] === "attach" ||
            args[0] === "kill" ||
            args.includes("--bg") ||
            args.includes("--background"))
    ) {
        profileCheckpoint("cli_bg_path");
        const { enableConfigs } = await import("../utils/config.js");
        enableConfigs();
        const bg = await import("../cli/bg.js");
        switch (args[0]) {
            case "ps":
                await bg.psHandler(args.slice(1));
                break;
            case "logs":
                await bg.logsHandler(args[1]);
                break;
            case "attach":
                await bg.attachHandler(args[1]);
                break;
            case "kill":
                await bg.killHandler(args[1]);
                break;
            default:
                await bg.handleBgFlag(args);
        }
        return;
    }

    // Fast-path for template job commands.
    // 模板作业命令的快速路径。
    if (
        feature("TEMPLATES") &&
        (args[0] === "new" || args[0] === "list" || args[0] === "reply")
    ) {
        profileCheckpoint("cli_templates_path");
        const { templatesMain } =
            await import("../cli/handlers/templateJobs.js");
        await templatesMain(args);
        // process.exit (not return) — mountFleetView's Ink TUI can leave event
        // loop handles that prevent natural exit.
        // 使用 process.exit（而非 return）— mountFleetView 的 Ink TUI 可能留下
        // 事件循环句柄，阻止自然退出。
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    }

    // Fast-path for `claude environment-runner`: headless BYOC runner.
    // feature() must stay inline for build-time dead code elimination.
    // `claude environment-runner` 的快速路径：无头 BYOC（自托管）运行器。
    // feature() 必须保持内联以便构建时死代码消除。
    if (
        feature("BYOC_ENVIRONMENT_RUNNER") &&
        args[0] === "environment-runner"
    ) {
        profileCheckpoint("cli_environment_runner_path");
        const { environmentRunnerMain } =
            await import("../environment-runner/main.js");
        await environmentRunnerMain(args.slice(1));
        return;
    }

    // Fast-path for `claude self-hosted-runner`: headless self-hosted-runner
    // targeting the SelfHostedRunnerWorkerService API (register + poll; poll IS
    // heartbeat). feature() must stay inline for build-time dead code elimination.
    // `claude self-hosted-runner` 的快速路径：无头自托管运行器，
    // 使用 SelfHostedRunnerWorkerService API（注册 + 轮询；轮询即心跳）。
    // feature() 必须保持内联以便构建时死代码消除。
    if (feature("SELF_HOSTED_RUNNER") && args[0] === "self-hosted-runner") {
        profileCheckpoint("cli_self_hosted_runner_path");
        const { selfHostedRunnerMain } =
            await import("../self-hosted-runner/main.js");
        await selfHostedRunnerMain(args.slice(1));
        return;
    }

    // Fast-path for --worktree --tmux: exec into tmux before loading full CLI
    // --worktree --tmux 的快速路径：在加载完整 CLI 之前进入 tmux
    const hasTmuxFlag =
        args.includes("--tmux") || args.includes("--tmux=classic");
    if (
        hasTmuxFlag &&
        (args.includes("-w") ||
            args.includes("--worktree") ||
            args.some((a) => a.startsWith("--worktree=")))
    ) {
        profileCheckpoint("cli_tmux_worktree_fast_path");
        const { enableConfigs } = await import("../utils/config.js");
        enableConfigs();
        const { isWorktreeModeEnabled } =
            await import("../utils/worktreeModeEnabled.js");
        if (isWorktreeModeEnabled()) {
            const { execIntoTmuxWorktree } =
                await import("../utils/worktree.js");
            const result = await execIntoTmuxWorktree(args);
            if (result.handled) {
                return;
            }
            // If not handled (e.g., error), fall through to normal CLI
            // 如果未处理（例如出错），继续到正常 CLI 流程
            if (result.error) {
                const { exitWithError } = await import("../utils/process.js");
                exitWithError(result.error);
            }
        }
    }

    // Redirect common update flag mistakes to the update subcommand
    // 将常见的更新标志误用重定向到 update 子命令
    if (
        args.length === 1 &&
        (args[0] === "--update" || args[0] === "--upgrade")
    ) {
        process.argv = [process.argv[0]!, process.argv[1]!, "update"];
    }

    // --bare: set SIMPLE early so gates fire during module eval / commander
    // option building (not just inside the action handler).
    // --bare：提前设置 SIMPLE，以便在模块求值/commander 选项构建期间触发门控
    // （而不仅仅在 action handler 内部）。
    if (args.includes("--bare")) {
        process.env.CLAUDE_CODE_SIMPLE = "1";
    }

    // No special flags detected, load and run the full CLI
    // 未检测到特殊标志，加载并运行完整 CLI
    const { startCapturingEarlyInput } = await import("../utils/earlyInput.js");
    startCapturingEarlyInput();
    profileCheckpoint("cli_before_main_import");
    const { main: cliMain } = await import("../main.jsx");
    profileCheckpoint("cli_after_main_import");
    await cliMain();
    profileCheckpoint("cli_after_main_complete");
}

// eslint-disable-next-line custom-rules/no-top-level-side-effects
void main();
