import type { ReactNode } from 'react';

/** Ribbon 分组：内容区 + 底部组名，右侧带竖线分隔 */
export default function RibbonGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `ppt-rb-group ${className}` : 'ppt-rb-group'}>
      <div className="ppt-rb-group-body">{children}</div>
      <span className="ppt-rb-group-label">{label}</span>
    </div>
  );
}

/** 分组内的一列（用于把小按钮竖排成 2-3 行） */
export function RibbonColumn({ children }: { children: ReactNode }) {
  return <div className="ppt-rb-col">{children}</div>;
}

/** 分组内的一行小按钮 */
export function RibbonRow({ children }: { children: ReactNode }) {
  return <div className="ppt-rb-row">{children}</div>;
}
