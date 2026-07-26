import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { RibbonCommands, RibbonContextValue } from '../components/PptEditor/Ribbon/types';
import {
  applyParagraphPatchToElement,
  readParagraphFormat,
  setTextDirection,
  setTextValign,
} from '../lib/ppt-ops/paragraph';
import { addHyperlinkToSlide } from '../lib/ppt-ops/rels';
import {
  alignElement,
  deleteElement,
  duplicateElement,
  insertShape,
  moveElement,
  pasteElementXml,
  readElementXml,
  readShapeFormat,
  reorderElement,
  setElementBox,
  setShapeFill,
  setShapeLine,
} from '../lib/ppt-ops/shape';
import {
  appendCharToElement,
  insertDateTime,
  insertFooter,
  insertSlideNumber,
  insertTable,
  insertTextBox,
  insertWordArt,
} from '../lib/ppt-ops/insert';
import {
  applyRunPatchToCharRange,
  applyRunPatchToElement,
  changeElementCase,
  charRangeForCaret,
  readRunFormat,
  readRunFormatInRange,
  type RunPatch,
} from '../lib/ppt-ops/text';
import { findElementById, pctToEmu, type BoxEmu } from '../lib/ppt-ops/xml';
import type { useMergedPptEditor } from './useMergedPptEditor';

type Editor = ReturnType<typeof useMergedPptEditor>;

export type RibbonUiState = {
  zoom: number;
  setZoom: (zoom: number) => void;
  fitToWindow: () => void;
  showGrid: boolean;
  toggleGrid: () => void;
  showGuides: boolean;
  toggleGuides: () => void;
  showRuler: boolean;
  toggleRuler: () => void;
  pickImage: () => void;
  openFind: () => void;
  openReplace: () => void;
  toggleSelectionPane: () => void;
  /** 画布文本框内高亮选区；有区间时字体命令只改选中字符 */
  textCharRange?: { elementId: number; start: number; end: number } | null;
  /**
   * 锁定幻灯片结构：禁用新建/复制/删除幻灯片。
   * 周报分区编辑器需要它——增删页目前不会进入预览/导出，放开会造成错页。
   */
  lockSlideStructure?: boolean;
};

const FONT_STEP_PT = 2;
const NUDGE_PCT = 0.5;

export type RibbonCommandsResult = RibbonContextValue & {
  /** 画布拖动：按百分比位移 */
  moveElementByPct: (elementId: number, dxPct: number, dyPct: number) => void;
  /** 画布缩放：目标百分比框 */
  resizeElementByPct: (
    elementId: number,
    box: { leftPct: number; topPct: number; widthPct: number; heightPct: number },
  ) => void;
  /** 方向键微调选中元素 */
  nudgeSelection: (dxPct: number, dyPct: number) => void;
};

export function useRibbonCommands(editor: Editor, ui: RibbonUiState): RibbonCommandsResult {
  const { t } = useI18n();
  const {
    focusIndex,
    slides,
    currentSlide,
    currentSlideXml,
    slideSize,
    layouts,
    selectedElementId,
    setSelectedElementId,
    mutateSlideXml,
    canEditCanvas,
  } = editor;

  const [clipboard, setClipboard] = useState<string | null>(null);
  const [painter, setPainter] = useState<RunPatch | null>(null);
  const painterRef = useRef<RunPatch | null>(null);
  const lastPaintedRef = useRef<number | null>(null);

  useEffect(() => {
    painterRef.current = painter;
  }, [painter]);

  const selectedXml = useMemo(() => {
    if (!currentSlideXml || selectedElementId == null) return null;
    return findElementById(currentSlideXml, selectedElementId)?.xml ?? null;
  }, [currentSlideXml, selectedElementId]);

  const hasSelection = !!selectedXml;
  const hasTextSelection = !!selectedXml?.includes('<p:txBody>');

  const textFormat = useMemo(() => {
    if (!selectedXml || !hasTextSelection) return null;
    const range = ui.textCharRange;
    const runFmt =
      range &&
      range.elementId === selectedElementId &&
      range.end > range.start
        ? readRunFormatInRange(selectedXml, range.start, range.end)
        : readRunFormat(selectedXml);
    return { ...runFmt, ...readParagraphFormat(selectedXml) };
  }, [hasTextSelection, selectedElementId, selectedXml, ui.textCharRange]);

  const shapeFormat = useMemo(() => {
    if (!selectedXml) return null;
    return readShapeFormat(selectedXml);
  }, [selectedXml]);

  /** 对当前页做一次 XML 改写 */
  const edit = useCallback(
    (mutator: (xml: string) => string) => {
      if (!canEditCanvas) return;
      mutateSlideXml(focusIndex, mutator);
    },
    [canEditCanvas, focusIndex, mutateSlideXml],
  );

  /** 需要选中元素的改写 */
  const editSelected = useCallback(
    (mutator: (xml: string, elementId: number) => string) => {
      if (selectedElementId == null) return;
      const id = selectedElementId;
      edit((xml) => mutator(xml, id));
    },
    [edit, selectedElementId],
  );

  const runPatch = useCallback(
    (patch: RunPatch) => {
      if (selectedElementId == null) return;
      const id = selectedElementId;
      const range = ui.textCharRange;
      edit((xml) => {
        if (range && range.elementId === id) {
          if (range.end > range.start) {
            return applyRunPatchToCharRange(xml, id, range.start, range.end, patch);
          }
          // 编辑中仅有光标：只改光标所在 run，避免整框多色被一锅端
          const el = findElementById(xml, id);
          const span = el ? charRangeForCaret(el.xml, range.start) : null;
          if (span) {
            return applyRunPatchToCharRange(xml, id, span.start, span.end, patch);
          }
        }
        return applyRunPatchToElement(xml, id, patch);
      });
    },
    [edit, selectedElementId, ui.textCharRange],
  );

  // 格式刷：激活后点选下一个元素即套用
  useEffect(() => {
    const brush = painterRef.current;
    if (!brush || selectedElementId == null) return;
    if (lastPaintedRef.current === selectedElementId) return;
    lastPaintedRef.current = selectedElementId;
    const id = selectedElementId;
    mutateSlideXml(focusIndex, (xml) => applyRunPatchToElement(xml, id, brush));
    setPainter(null);
    painterRef.current = null;
  }, [focusIndex, mutateSlideXml, selectedElementId]);

  const toggleFormatPainter = useCallback(() => {
    if (painter) {
      setPainter(null);
      return;
    }
    if (!textFormat) return;
    setPainter({
      bold: textFormat.bold,
      italic: textFormat.italic,
      underline: textFormat.underline,
      strike: textFormat.strike,
      shadow: textFormat.shadow,
      fontSizePt: textFormat.fontSizePt,
      color: textFormat.color,
      fontFamily: textFormat.fontFamily,
    });
    lastPaintedRef.current = selectedElementId;
  }, [painter, selectedElementId, textFormat]);

  const copySelection = useCallback(() => {
    if (!currentSlideXml || selectedElementId == null) return;
    const xml = readElementXml(currentSlideXml, selectedElementId);
    if (xml) setClipboard(xml);
  }, [currentSlideXml, selectedElementId]);

  const deleteSelection = useCallback(() => {
    if (selectedElementId == null) return;
    const id = selectedElementId;
    edit((xml) => deleteElement(xml, id));
    setSelectedElementId(null);
  }, [edit, selectedElementId, setSelectedElementId]);

  const cutSelection = useCallback(() => {
    copySelection();
    deleteSelection();
  }, [copySelection, deleteSelection]);

  const pasteSelection = useCallback(() => {
    if (!clipboard) return;
    const suffix = t('ppt.ribbon.pastedSuffix');
    let pastedId: number | null = null;
    edit((xml) => {
      const result = pasteElementXml(xml, clipboard, suffix);
      pastedId = result.newId;
      return result.xml;
    });
    if (pastedId != null) setSelectedElementId(pastedId);
  }, [clipboard, edit, setSelectedElementId, t]);

  const duplicateSelection = useCallback(() => {
    if (selectedElementId == null) return;
    const id = selectedElementId;
    const suffix = t('ppt.ribbon.pastedSuffix');
    let newId: number | null = null;
    edit((xml) => {
      const result = duplicateElement(xml, id, suffix);
      if (!result) return xml;
      newId = result.newId;
      return result.xml;
    });
    if (newId != null) setSelectedElementId(newId);
  }, [edit, selectedElementId, setSelectedElementId, t]);

  const insertWithSelect = useCallback(
    (builder: (xml: string) => { xml: string; newId: number }) => {
      let newId: number | null = null;
      edit((xml) => {
        const result = builder(xml);
        newId = result.newId;
        return result.xml;
      });
      if (newId != null) setSelectedElementId(newId);
    },
    [edit, setSelectedElementId],
  );

  const insertLink = useCallback(
    (url: string) => {
      if (selectedElementId == null || !currentSlide?.slidePath) return;
      const id = selectedElementId;
      const slidePath = currentSlide.slidePath;
      void (async () => {
        const base = await editor.flushToWorkingFile();
        if (!base) return;
        const next = await addHyperlinkToSlide(base, slidePath, id, url);
        await editor.reloadFromWorkingFile(next, slidePath);
      })();
    },
    [currentSlide?.slidePath, editor, selectedElementId],
  );

  /** 画布拖动：按百分比转 EMU */
  const moveElementByPct = useCallback(
    (elementId: number, dxPct: number, dyPct: number) => {
      edit((xml) =>
        moveElement(
          xml,
          elementId,
          pctToEmu(dxPct, slideSize.cx),
          pctToEmu(dyPct, slideSize.cy),
          slideSize,
        ),
      );
    },
    [edit, slideSize],
  );

  const resizeElementByPct = useCallback(
    (
      elementId: number,
      box: { leftPct: number; topPct: number; widthPct: number; heightPct: number },
    ) => {
      const emu: BoxEmu = {
        x: pctToEmu(box.leftPct, slideSize.cx),
        y: pctToEmu(box.topPct, slideSize.cy),
        cx: pctToEmu(box.widthPct, slideSize.cx),
        cy: pctToEmu(box.heightPct, slideSize.cy),
      };
      edit((xml) => setElementBox(xml, elementId, emu));
    },
    [edit, slideSize],
  );

  const nudgeSelection = useCallback(
    (dxPct: number, dyPct: number) => {
      if (selectedElementId == null) return;
      moveElementByPct(selectedElementId, dxPct, dyPct);
    },
    [moveElementByPct, selectedElementId],
  );

  const resetSlide = useCallback(() => {
    editor.resetSlideEdits(focusIndex);
    setSelectedElementId(null);
  }, [editor, focusIndex, setSelectedElementId]);

  const cmd: RibbonCommands = useMemo(
    () => ({
      // 剪贴板
      cut: hasSelection ? cutSelection : undefined,
      copy: hasSelection ? copySelection : undefined,
      paste: clipboard ? pasteSelection : undefined,
      formatPainterActive: !!painter,
      toggleFormatPainter,

      // 幻灯片
      newSlide:
        !ui.lockSlideStructure && editor.canDuplicate
          ? () => editor.addSlideAfter(focusIndex, true)
          : undefined,
      duplicateSlide:
        !ui.lockSlideStructure && editor.canDuplicate
          ? () => editor.addSlideAfter(focusIndex, false)
          : undefined,
      deleteSlide:
        !ui.lockSlideStructure && editor.canSkip
          ? () => editor.requestSkipSlide(focusIndex)
          : undefined,
      resetSlide: canEditCanvas ? resetSlide : undefined,

      // 字体
      setFontFamily: (family) => runPatch({ fontFamily: family }),
      setFontSize: (pt) => runPatch({ fontSizePt: pt }),
      growFont: () => runPatch({ fontSizeDelta: FONT_STEP_PT }),
      shrinkFont: () => runPatch({ fontSizeDelta: -FONT_STEP_PT }),
      toggleBold: () => runPatch({ bold: !textFormat?.bold }),
      toggleItalic: () => runPatch({ italic: !textFormat?.italic }),
      toggleUnderline: () => runPatch({ underline: !textFormat?.underline }),
      toggleStrike: () => runPatch({ strike: !textFormat?.strike }),
      toggleShadow: () => runPatch({ shadow: !textFormat?.shadow }),
      setFontColor: (hex) => runPatch({ color: hex }),
      clearFormatting: () => runPatch({ clearAll: true }),
      changeCase: (action) => editSelected((xml, id) => changeElementCase(xml, id, action)),

      // 段落
      setAlign: (align) =>
        editSelected((xml, id) => applyParagraphPatchToElement(xml, id, { align })),
      setLineSpacing: (value) =>
        editSelected((xml, id) => applyParagraphPatchToElement(xml, id, { lineSpacing: value })),
      setBullet: (kind) =>
        editSelected((xml, id) => applyParagraphPatchToElement(xml, id, { bullet: kind })),
      indentMore: () =>
        editSelected((xml, id) => applyParagraphPatchToElement(xml, id, { levelDelta: 1 })),
      indentLess: () =>
        editSelected((xml, id) => applyParagraphPatchToElement(xml, id, { levelDelta: -1 })),
      setTextDirection: (dir) => editSelected((xml, id) => setTextDirection(xml, id, dir)),
      setTextValign: (valign) => editSelected((xml, id) => setTextValign(xml, id, valign)),

      // 绘图
      insertShape: canEditCanvas
        ? (preset) => insertWithSelect((xml) => insertShape(xml, { preset, slideSize }))
        : undefined,
      setShapeFill: hasSelection
        ? (hex) => editSelected((xml, id) => setShapeFill(xml, id, hex))
        : undefined,
      setShapeLine: hasSelection
        ? (hex) => editSelected((xml, id) => setShapeLine(xml, id, hex))
        : undefined,
      orderShape: hasSelection
        ? (action) => editSelected((xml, id) => reorderElement(xml, id, action))
        : undefined,
      alignShape: hasSelection
        ? (action) => editSelected((xml, id) => alignElement(xml, id, action, slideSize))
        : undefined,
      deleteSelection: hasSelection ? deleteSelection : undefined,
      duplicateSelection: hasSelection ? duplicateSelection : undefined,

      // 编辑
      openFind: ui.openFind,
      openReplace: ui.openReplace,
      toggleSelectionPane: ui.toggleSelectionPane,

      // 插入
      insertTextBox: canEditCanvas
        ? () =>
            insertWithSelect((xml) =>
              insertTextBox(xml, { slideSize, text: t('ppt.ribbon.newTextBoxText') }),
            )
        : undefined,
      insertPicture: canEditCanvas ? ui.pickImage : undefined,
      insertTable: canEditCanvas
        ? (rows, cols) => insertWithSelect((xml) => insertTable(xml, { slideSize, rows, cols }))
        : undefined,
      insertWordArt: canEditCanvas
        ? () =>
            insertWithSelect((xml) =>
              insertWordArt(xml, { slideSize, text: t('ppt.ribbon.wordArtText') }),
            )
        : undefined,
      insertSlideNumber: canEditCanvas
        ? () => insertWithSelect((xml) => insertSlideNumber(xml, slideSize))
        : undefined,
      insertDateTime: canEditCanvas
        ? () =>
            insertWithSelect((xml) =>
              insertDateTime(xml, slideSize, new Date().toLocaleDateString()),
            )
        : undefined,
      insertHeaderFooter: canEditCanvas
        ? () =>
            insertWithSelect((xml) => insertFooter(xml, slideSize, t('ppt.ribbon.footerText')))
        : undefined,
      insertSymbol: hasTextSelection
        ? (char) => editSelected((xml, id) => appendCharToElement(xml, id, char))
        : undefined,
      insertLink: hasTextSelection ? insertLink : undefined,

      // 视图
      zoom: ui.zoom,
      setZoom: ui.setZoom,
      fitToWindow: ui.fitToWindow,
      showGrid: ui.showGrid,
      toggleGrid: ui.toggleGrid,
      showGuides: ui.showGuides,
      toggleGuides: ui.toggleGuides,
      showRuler: ui.showRuler,
      toggleRuler: ui.toggleRuler,

      // 通用
      undo: editor.undo,
      redo: editor.redo,
      save: () => void editor.saveChanges(),
      discard: editor.discardChanges,
    }),
    [
      canEditCanvas,
      clipboard,
      copySelection,
      cutSelection,
      deleteSelection,
      duplicateSelection,
      editSelected,
      editor,
      focusIndex,
      hasSelection,
      hasTextSelection,
      insertLink,
      insertWithSelect,
      painter,
      pasteSelection,
      resetSlide,
      runPatch,
      slideSize,
      t,
      textFormat,
      toggleFormatPainter,
      ui,
    ],
  );

  return {
    hasSelection,
    hasTextSelection,
    selectionCount: hasSelection ? 1 : 0,
    textFormat,
    shapeFormat,
    slideCount: slides.length,
    slideIndex: focusIndex,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo,
    dirty: editor.dirty,
    saving: editor.saving,
    canEditSlide: canEditCanvas,
    layouts: layouts.map((l) => ({ path: l.path, name: l.name })),
    cmd,
    moveElementByPct,
    resizeElementByPct,
    nudgeSelection,
  };
}

export const NUDGE_STEP_PCT = NUDGE_PCT;
