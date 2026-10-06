import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

interface RootStartupLoadingProps {
  label: string;
  children?: ReactNode;
  busy?: boolean;
}

export function RootStartupLoading({ label, children, busy = true }: RootStartupLoadingProps) {
  return (
    <div
      // Web 端全局 html/body/#root 为 Electron 透明背景让路，React 接管后会替换 HTML 启动壳。
      // 这里必须由阻塞态自身承接主题背景，否则远控链接会在 Root 恢复期间继续露出浏览器白底。
      className="flex h-full min-h-dvh flex-col items-center justify-center gap-6 bg-background text-foreground"
      role="status"
      aria-busy={busy}
      aria-label={label}
      data-testid="root-startup-loading"
    >
      <ZCodeStartupLogoBadge />
      {children}
    </div>
  );
}

/** 初始化与引导共用品牌图标，保持底色、描边、圆角和标志比例一致。 */
export function ZCodeStartupLogoBadge({ animated = true }: { animated?: boolean }) {
  return (
    <div className="relative flex size-24 items-center justify-center rounded-3xl bg-[linear-gradient(180deg,#000000_0%,#151718_100%)] text-[#ffffff] shadow-xl/20 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-[rgba(255,255,255,0.1)] before:content-['']">
      <ZCodeStartupLogo className="h-auto w-14" animated={animated} />
    </div>
  );
}

function ZCodeStartupLogo({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      fill="none"
      viewBox="0 0 48 48"
      className={cn("shrink-0 text-current", className)}
      aria-hidden="true"
      focusable="false"
    >
      {animated ? (
        <animate
          attributeName="opacity"
          begin="3s"
          dur="1.8s"
          repeatCount="indefinite"
          values="1;0.4;1"
        />
      ) : null}
      {/* FAgent 品牌图形：六边形框架 + 三根 K 线蜡烛（与桌面应用图标同源） */}
      <path
        d="M17 8.5 H31 L39 15 V25"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M31 39.5 H17 L9 33 V23"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="39" cy="28" r="2.6" fill="currentColor" />
      <circle cx="9" cy="20" r="2.6" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2">
        <line x1="16" y1="20" x2="16" y2="30" />
        <line x1="24" y1="13" x2="24" y2="35" />
        <line x1="32" y1="22" x2="32" y2="29" />
      </g>
      <g fill="currentColor">
        <rect x="14" y="22.5" width="4" height="4.5" rx="1" />
        <rect x="22" y="16.5" width="4" height="13" rx="1" />
        <rect x="30" y="24" width="4" height="4" rx="1" />
      </g>
    </svg>
  );
}
