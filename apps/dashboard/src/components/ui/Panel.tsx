import React from "react";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  noPadding?: boolean;
}

export function Panel({
  className = "",
  title,
  icon,
  headerRight,
  noPadding = false,
  children,
  ...props
}: PanelProps) {
  return (
    <div className={`fin-panel flex flex-col overflow-hidden ${className}`} {...props}>
      {/* Optional Header */}
      {(title || icon || headerRight) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-fin-border bg-fin-panel/50">
          <div className="flex items-center gap-2">
            {icon && <span className="text-primary-400">{icon}</span>}
            {title && (
              <h2 className="text-xs uppercase font-semibold tracking-wider text-slate-300">
                {title}
              </h2>
            )}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      
      {/* Content Body */}
      <div className={`relative flex-1 ${noPadding ? "" : "p-4"}`}>
        {children}
      </div>
    </div>
  );
}
