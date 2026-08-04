/** Ribbon 图标：内联 SVG，24x24 网格，线宽统一 1.6 */

export type RibbonIconName =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'formatPainter'
  | 'newSlide'
  | 'layout'
  | 'reset'
  | 'section'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'shadow'
  | 'growFont'
  | 'shrinkFont'
  | 'clearFormat'
  | 'changeCase'
  | 'fontColor'
  | 'bullets'
  | 'numbering'
  | 'indentMore'
  | 'indentLess'
  | 'lineSpacing'
  | 'textDirection'
  | 'alignText'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignJustify'
  | 'shapes'
  | 'arrange'
  | 'shapeFill'
  | 'shapeOutline'
  | 'find'
  | 'replace'
  | 'selectPane'
  | 'textBox'
  | 'picture'
  | 'table'
  | 'wordArt'
  | 'slideNumber'
  | 'dateTime'
  | 'headerFooter'
  | 'symbol'
  | 'link'
  | 'video'
  | 'audio'
  | 'chart'
  | 'smartArt'
  | 'icons3d'
  | 'screenshot'
  | 'zoom'
  | 'fitWindow'
  | 'grid'
  | 'guides'
  | 'ruler'
  | 'undo'
  | 'redo'
  | 'save'
  | 'upload'
  | 'discard'
  | 'delete'
  | 'duplicate'
  | 'theme'
  | 'transition'
  | 'animation'
  | 'play'
  | 'comment'
  | 'spelling'
  | 'outline'
  | 'master'
  | 'placeholder';

type Props = {
  name: RibbonIconName;
  className?: string;
};

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const GLYPH_STYLE = {
  fontSize: 15,
  fontWeight: 700,
  fill: 'currentColor',
  stroke: 'none',
  textAnchor: 'middle' as const,
};

function Glyph({
  children,
  italic = false,
  underline = false,
  strike = false,
}: {
  children: string;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}) {
  return (
    <>
      <text
        x={12}
        y={17}
        style={{ ...GLYPH_STYLE, fontStyle: italic ? 'italic' : 'normal' }}
      >
        {children}
      </text>
      {underline && <path d="M6 20h12" {...S} />}
      {strike && <path d="M5 12h14" {...S} />}
    </>
  );
}

function Body({ name }: { name: RibbonIconName }) {
  switch (name) {
    case 'cut':
      return (
        <>
          <circle cx={7} cy={18} r={2.4} {...S} />
          <circle cx={17} cy={18} r={2.4} {...S} />
          <path d="M8.6 16.2 17 4M15.4 16.2 7 4" {...S} />
        </>
      );
    case 'copy':
      return (
        <>
          <rect x={4} y={4} width={11} height={13} rx={1.6} {...S} />
          <path d="M9 20h9a2 2 0 0 0 2-2V8" {...S} />
        </>
      );
    case 'paste':
      return (
        <>
          <path d="M9 4h6v3H9z" {...S} />
          <path d="M7 5.5H5.5A1.5 1.5 0 0 0 4 7v12.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H17" {...S} />
        </>
      );
    case 'formatPainter':
      return (
        <>
          <path d="M5 4h11v5H5z" {...S} />
          <path d="M10.5 9v3.5h3V16" {...S} />
          <rect x={11} y={16} width={5} height={5} rx={1.2} {...S} />
        </>
      );
    case 'newSlide':
      return (
        <>
          <rect x={3} y={5} width={13} height={9} rx={1.4} {...S} />
          <path d="M18 15v6M15 18h6" {...S} />
        </>
      );
    case 'layout':
      return (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={1.6} {...S} />
          <path d="M3.5 10h17M11 10v9.5" {...S} />
        </>
      );
    case 'reset':
      return (
        <>
          <path d="M20 12a8 8 0 1 1-2.7-6" {...S} />
          <path d="M20 4v5h-5" {...S} />
        </>
      );
    case 'section':
      return (
        <>
          <path d="M4 6h7l1.6 2.2H20V19H4z" {...S} />
        </>
      );
    case 'bold':
      return <Glyph>B</Glyph>;
    case 'italic':
      return <Glyph italic>I</Glyph>;
    case 'underline':
      return <Glyph underline>U</Glyph>;
    case 'strike':
      return <Glyph strike>S</Glyph>;
    case 'shadow':
      return (
        <>
          <text x={10} y={17} style={GLYPH_STYLE}>
            S
          </text>
          <text x={13.5} y={19} style={{ ...GLYPH_STYLE, opacity: 0.4 }}>
            S
          </text>
        </>
      );
    case 'growFont':
      return (
        <>
          <text x={9} y={18} style={{ ...GLYPH_STYLE, fontSize: 17 }}>
            A
          </text>
          <path d="M17 11V5M14 8h6" {...S} />
        </>
      );
    case 'shrinkFont':
      return (
        <>
          <text x={9} y={18} style={{ ...GLYPH_STYLE, fontSize: 13 }}>
            A
          </text>
          <path d="M14 8h6" {...S} />
        </>
      );
    case 'clearFormat':
      return (
        <>
          <text x={10} y={17} style={GLYPH_STYLE}>
            A
          </text>
          <path d="M15 6l5 5M20 6l-5 5" {...S} />
        </>
      );
    case 'changeCase':
      return (
        <>
          <text x={8} y={18} style={{ ...GLYPH_STYLE, fontSize: 15 }}>
            A
          </text>
          <text x={17} y={18} style={{ ...GLYPH_STYLE, fontSize: 12 }}>
            a
          </text>
        </>
      );
    case 'fontColor':
      return (
        <>
          <text x={12} y={15} style={{ ...GLYPH_STYLE, fontSize: 13 }}>
            A
          </text>
          <path d="M5 19h14v2.5H5z" fill="currentColor" stroke="none" />
        </>
      );
    case 'bullets':
      return (
        <>
          <circle cx={5} cy={7} r={1.4} fill="currentColor" stroke="none" />
          <circle cx={5} cy={12} r={1.4} fill="currentColor" stroke="none" />
          <circle cx={5} cy={17} r={1.4} fill="currentColor" stroke="none" />
          <path d="M9.5 7h11M9.5 12h11M9.5 17h11" {...S} />
        </>
      );
    case 'numbering':
      return (
        <>
          <text x={4.5} y={9} style={{ ...GLYPH_STYLE, fontSize: 8, textAnchor: 'start' }}>
            1
          </text>
          <text x={4.5} y={14.5} style={{ ...GLYPH_STYLE, fontSize: 8, textAnchor: 'start' }}>
            2
          </text>
          <text x={4.5} y={20} style={{ ...GLYPH_STYLE, fontSize: 8, textAnchor: 'start' }}>
            3
          </text>
          <path d="M10 7h10.5M10 12.5h10.5M10 18h10.5" {...S} />
        </>
      );
    case 'indentMore':
      return (
        <>
          <path d="M11 7h9.5M11 12h9.5M11 17h9.5" {...S} />
          <path d="M4 9.5 7.5 12 4 14.5z" fill="currentColor" stroke="none" />
        </>
      );
    case 'indentLess':
      return (
        <>
          <path d="M11 7h9.5M11 12h9.5M11 17h9.5" {...S} />
          <path d="M7.5 9.5 4 12l3.5 2.5z" fill="currentColor" stroke="none" />
        </>
      );
    case 'lineSpacing':
      return (
        <>
          <path d="M5 5v14M2.5 7.5 5 5l2.5 2.5M2.5 16.5 5 19l2.5-2.5" {...S} />
          <path d="M10 7h11M10 12h11M10 17h11" {...S} />
        </>
      );
    case 'textDirection':
      return (
        <>
          <text x={9} y={16} style={{ ...GLYPH_STYLE, fontSize: 13 }}>
            A
          </text>
          <path d="M16 6v12M13.5 15.5 16 18l2.5-2.5" {...S} />
        </>
      );
    case 'alignText':
      return (
        <>
          <rect x={4} y={4.5} width={16} height={15} rx={1.4} {...S} />
          <path d="M7 9h10M7 12.5h10" {...S} />
        </>
      );
    case 'alignLeft':
      return <path d="M4 6h16M4 10.5h10M4 15h16M4 19.5h10" {...S} />;
    case 'alignCenter':
      return <path d="M4 6h16M7 10.5h10M4 15h16M7 19.5h10" {...S} />;
    case 'alignRight':
      return <path d="M4 6h16M10 10.5h10M4 15h16M10 19.5h10" {...S} />;
    case 'alignJustify':
      return <path d="M4 6h16M4 10.5h16M4 15h16M4 19.5h16" {...S} />;
    case 'shapes':
      return (
        <>
          <rect x={3.5} y={3.5} width={8} height={8} rx={1.2} {...S} />
          <circle cx={16.5} cy={16.5} r={4.2} {...S} />
          <path d="M16.5 3.5 20.5 11h-8z" {...S} />
        </>
      );
    case 'arrange':
      return (
        <>
          <rect x={3.5} y={3.5} width={11} height={11} rx={1.4} {...S} />
          <rect x={9.5} y={9.5} width={11} height={11} rx={1.4} {...S} />
        </>
      );
    case 'shapeFill':
      return (
        <>
          <path d="M6 13 13 6l5 5-7 7z" {...S} />
          <path d="M18 15c1.5 2 2.5 3 2.5 4a2.5 2.5 0 0 1-5 0c0-1 1-2 2.5-4z" fill="currentColor" stroke="none" />
        </>
      );
    case 'shapeOutline':
      return (
        <>
          <rect x={4} y={6} width={16} height={12} rx={1.6} {...S} strokeWidth={2.6} />
        </>
      );
    case 'find':
      return (
        <>
          <circle cx={11} cy={11} r={6.5} {...S} />
          <path d="M16 16l4.5 4.5" {...S} />
        </>
      );
    case 'replace':
      return (
        <>
          <path d="M4 8h11M11.5 4.5 15 8l-3.5 3.5" {...S} />
          <path d="M20 16H9M12.5 12.5 9 16l3.5 3.5" {...S} />
        </>
      );
    case 'selectPane':
      return (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={1.6} {...S} />
          <path d="M13 4.5v15" {...S} />
          <path d="M6 9h4M6 12.5h4" {...S} />
        </>
      );
    case 'textBox':
      return (
        <>
          <rect x={3.5} y={6} width={17} height={12} rx={1.4} {...S} />
          <path d="M8 9.5h8M12 9.5v5.5" {...S} />
        </>
      );
    case 'picture':
      return (
        <>
          <rect x={3.5} y={5} width={17} height={14} rx={1.6} {...S} />
          <circle cx={8.5} cy={10} r={1.6} {...S} />
          <path d="M4.5 17l4.5-4.5 3.5 3.5 3-2.5 4 4" {...S} />
        </>
      );
    case 'table':
      return (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={1.4} {...S} />
          <path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15" {...S} />
        </>
      );
    case 'wordArt':
      return (
        <>
          <text x={12} y={17} style={{ ...GLYPH_STYLE, fontSize: 15, fontStyle: 'italic' }}>
            A
          </text>
          <path d="M4 20h16" {...S} />
        </>
      );
    case 'slideNumber':
      return (
        <>
          <rect x={3.5} y={5} width={17} height={14} rx={1.6} {...S} />
          <text x={16} y={17} style={{ ...GLYPH_STYLE, fontSize: 8 }}>
            7
          </text>
        </>
      );
    case 'dateTime':
      return (
        <>
          <rect x={3.5} y={5.5} width={17} height={14} rx={1.6} {...S} />
          <path d="M3.5 10h17M8 3.5v4M16 3.5v4" {...S} />
        </>
      );
    case 'headerFooter':
      return (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={1.4} {...S} />
          <path d="M3.5 8.5h17M3.5 15.5h17" {...S} />
        </>
      );
    case 'symbol':
      return (
        <>
          <text x={12} y={17} style={{ ...GLYPH_STYLE, fontSize: 15 }}>
            Ω
          </text>
        </>
      );
    case 'link':
      return (
        <>
          <path d="M10 14a3.5 3.5 0 0 1 0-5l2.5-2.5a3.5 3.5 0 0 1 5 5L16 13" {...S} />
          <path d="M14 10a3.5 3.5 0 0 1 0 5L11.5 17.5a3.5 3.5 0 0 1-5-5L8 11" {...S} />
        </>
      );
    case 'video':
      return (
        <>
          <rect x={3} y={6} width={12} height={12} rx={1.6} {...S} />
          <path d="M15 11l5.5-3v8L15 13z" {...S} />
        </>
      );
    case 'audio':
      return (
        <>
          <path d="M5 10h3l4-3.5v11L8 14H5z" {...S} />
          <path d="M15.5 9a4 4 0 0 1 0 6" {...S} />
        </>
      );
    case 'chart':
      return (
        <>
          <path d="M4 20V4" {...S} />
          <path d="M4 20h16" {...S} />
          <rect x={7} y={12} width={3} height={5} {...S} />
          <rect x={12} y={8} width={3} height={9} {...S} />
          <rect x={17} y={10} width={3} height={7} {...S} />
        </>
      );
    case 'smartArt':
      return (
        <>
          <rect x={9} y={3.5} width={6} height={5} rx={1} {...S} />
          <rect x={3} y={15.5} width={6} height={5} rx={1} {...S} />
          <rect x={15} y={15.5} width={6} height={5} rx={1} {...S} />
          <path d="M12 8.5v3.5M6 15.5V12h12v3.5" {...S} />
        </>
      );
    case 'icons3d':
      return (
        <>
          <path d="M12 3.5 20 8v8l-8 4.5L4 16V8z" {...S} />
          <path d="M4 8l8 4.5 8-4.5M12 12.5v8" {...S} />
        </>
      );
    case 'screenshot':
      return (
        <>
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" {...S} />
        </>
      );
    case 'zoom':
      return (
        <>
          <circle cx={11} cy={11} r={6.5} {...S} />
          <path d="M16 16l4.5 4.5M8.5 11h5M11 8.5v5" {...S} />
        </>
      );
    case 'fitWindow':
      return (
        <>
          <rect x={3.5} y={5} width={17} height={14} rx={1.6} {...S} />
          <path d="M8 9.5 12 12l-4 2.5M16 9.5 12 12l4 2.5" {...S} />
        </>
      );
    case 'grid':
      return (
        <>
          <path d="M4 4v16M9.3 4v16M14.7 4v16M20 4v16M4 4h16M4 9.3h16M4 14.7h16M4 20h16" {...S} strokeWidth={1.1} />
        </>
      );
    case 'guides':
      return (
        <>
          <path d="M12 3v18M3 12h18" {...S} strokeDasharray="3 2.5" />
        </>
      );
    case 'ruler':
      return (
        <>
          <rect x={3} y={8} width={18} height={7} rx={1.2} {...S} />
          <path d="M7.5 8v3M12 8v4M16.5 8v3" {...S} />
        </>
      );
    case 'undo':
      return (
        <>
          <path d="M8 8H16a4.5 4.5 0 0 1 0 9h-5" {...S} />
          <path d="M11 4.5 7 8l4 3.5" {...S} />
        </>
      );
    case 'redo':
      return (
        <>
          <path d="M16 8H8a4.5 4.5 0 0 0 0 9h5" {...S} />
          <path d="M13 4.5 17 8l-4 3.5" {...S} />
        </>
      );
    case 'save':
      return (
        <>
          <path d="M5 5h11l3 3v11H5z" {...S} />
          <path d="M9 5v5h6V5M9 19v-5h6v5" {...S} />
        </>
      );
    case 'upload':
      return (
        <>
          <path d="M12 15V5.5M8.5 9 12 5.5 15.5 9" {...S} />
          <path d="M5 14.5v3.5h14v-3.5" {...S} />
        </>
      );
    case 'discard':
      return (
        <>
          <path d="M6 6l12 12M18 6 6 18" {...S} />
        </>
      );
    case 'delete':
      return (
        <>
          <path d="M5 7h14M10 4.5h4M9 7v11M15 7v11" {...S} />
          <path d="M6.5 7l1 13h9l1-13" {...S} />
        </>
      );
    case 'duplicate':
      return (
        <>
          <rect x={4} y={4} width={11} height={11} rx={1.4} {...S} />
          <rect x={9} y={9} width={11} height={11} rx={1.4} {...S} />
        </>
      );
    case 'theme':
      return (
        <>
          <circle cx={12} cy={12} r={8.2} {...S} />
          <path d="M12 3.8V20.2M3.8 12h16.4" {...S} />
        </>
      );
    case 'transition':
      return (
        <>
          <rect x={3} y={6} width={8} height={12} rx={1.3} {...S} />
          <rect x={13} y={6} width={8} height={12} rx={1.3} {...S} strokeDasharray="3 2" />
          <path d="M11 12h2" {...S} />
        </>
      );
    case 'animation':
      return (
        <>
          <path d="M12 4v6M12 14v6M4 12h6M14 12h6" {...S} />
          <circle cx={12} cy={12} r={2.2} {...S} />
        </>
      );
    case 'play':
      return <path d="M8 5.5 19 12 8 18.5z" {...S} />;
    case 'comment':
      return (
        <>
          <path d="M4 6h16v10H12l-4 4v-4H4z" {...S} />
        </>
      );
    case 'spelling':
      return (
        <>
          <text x={9} y={15} style={{ ...GLYPH_STYLE, fontSize: 12 }}>
            A
          </text>
          <path d="M5 20h14" {...S} strokeDasharray="2 2" />
          <path d="M15 8.5l2 2 3.5-4" {...S} />
        </>
      );
    case 'outline':
      return (
        <>
          <path d="M4 6h4M10 6h10M4 12h4M10 12h10M4 18h4M10 18h10" {...S} />
        </>
      );
    case 'master':
      return (
        <>
          <rect x={3.5} y={4.5} width={17} height={12} rx={1.4} {...S} />
          <path d="M8 20h8" {...S} />
          <path d="M12 16.5V20" {...S} />
        </>
      );
    case 'placeholder':
    default:
      return (
        <>
          <rect x={4} y={4} width={16} height={16} rx={2} {...S} strokeDasharray="3 2" />
        </>
      );
  }
}

export default function RibbonIcon({ name, className }: Props) {
  return (
    <svg
      className={className ? `ppt-rb-icon ${className}` : 'ppt-rb-icon'}
      viewBox="0 0 24 24"
      width={24}
      height={24}
      aria-hidden
      focusable="false"
    >
      <Body name={name} />
    </svg>
  );
}
