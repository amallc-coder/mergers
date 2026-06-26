"use client";

import { useState } from "react";
import { cn } from "@/lib/ui";

export interface TabDef {
  key: string;
  label: string;
  badge?: number;
  content: React.ReactNode;
}

export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="scrollbar-thin -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-ink-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              tab.key === active
                ? "text-brand-700"
                : "text-ink-500 hover:text-ink-800",
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 ? (
                <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-600">
                  {tab.badge}
                </span>
              ) : null}
            </span>
            {tab.key === active ? (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-600" />
            ) : null}
          </button>
        ))}
      </div>
      <div>{activeTab?.content}</div>
    </div>
  );
}
