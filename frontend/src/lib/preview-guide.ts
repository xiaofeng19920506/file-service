export function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function isLegacyPowerPoint(name: string): boolean {
  return ['ppt', 'pps', 'pot'].includes(fileExtension(name));
}

export type PreviewGuideContent = {
  fileName: string;
  title: string;
  reason: string;
  steps: { label: string; detail: string }[];
  note: string;
};

export function buildPreviewConversionGuide(fileName: string): PreviewGuideContent {
  const ext = fileExtension(fileName);
  const isPpt = isLegacyPowerPoint(fileName);
  const isOdp = ext === 'odp';

  let reason: string;
  if (isPpt) {
    reason = `「${fileName}」是旧版 PowerPoint（.${ext}）格式，浏览器无法直接读取。预览需由服务端用 LibreOffice 转为 .pptx，但当前转换未成功（通常是因为未安装 LibreOffice，或 soffice 不在 PATH 中）。`;
  } else if (isOdp) {
    reason = `「${fileName}」是 OpenDocument 格式，预览需服务端转换，但当前未成功（通常是因为未安装 LibreOffice，或 soffice 不在 PATH 中）。`;
  } else {
    reason = `「${fileName}」暂不支持在当前环境中生成预览。`;
  }

  return {
    fileName,
    title: `无法预览此文件`,
    reason,
    steps: [
      {
        label: '另存为 .pptx 后重新上传（推荐，无需 LibreOffice）',
        detail: '用 PowerPoint、Keynote 或 WPS 打开文件 → 另存为/导出为 .pptx → 重新上传，即可直接预览、编辑与合并',
      },
      {
        label: '使用 Docker 中的 LibreOffice（周报预览推荐）',
        detail:
          '仓库根目录执行 npm run dev:docker，会启动 libreoffice 容器（:3010）；在 .env 添加 SOFFICE_PREVIEW_URL=http://localhost:3010 后重启 API',
      },
      {
        label: '安装 LibreOffice（适合批量 .ppt）',
        detail:
          'macOS: brew install --cask libreoffice · 安装完成后重启 npm run dev，并确认终端可运行 soffice --version',
      },
      {
        label: '新建或导出时直接使用 .pptx',
        detail: '.pptx 可在浏览器内直接预览、编辑与合并，不依赖 LibreOffice',
      },
    ],
    note: isPpt
      ? '提示：若不想安装 LibreOffice，将 .ppt 手动转为 .pptx 是最简单的做法。'
      : '提示：手动转为 .pptx 后重新上传，可跳过服务端转换。',
  };
}

export function isPreviewConversionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === 'preview_conversion_failed' ||
    error.message.includes('LibreOffice') ||
    error.message.includes('conversion failed')
  );
}
