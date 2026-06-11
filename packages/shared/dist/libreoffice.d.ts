export declare function needsLibreofficeConversion(ext: string): boolean;
export declare function convertWithLibreOffice(opts: {
    sofficePath: string;
    inputPath: string;
    outDir: string;
    convertTo: string;
}): Promise<string>;
export declare function convertToPptx(opts: {
    sofficePath: string;
    inputPath: string;
    outDir: string;
}): Promise<string>;
//# sourceMappingURL=libreoffice.d.ts.map