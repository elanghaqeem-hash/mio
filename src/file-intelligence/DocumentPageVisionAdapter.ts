export type DocumentPageRenderSource = 'PDF_RENDERER' | 'OFFICE_RENDERER' | 'IMAGE_DOCUMENT';
export type DocumentPagePixelFormat = 'GRAYSCALE8' | 'RGB8' | 'RGBA8';

export interface DocumentPageRaster {
  pageIndex: number;
  width: number;
  height: number;
  pixelFormat: DocumentPagePixelFormat;
  pixels: Uint8Array;
  source: DocumentPageRenderSource;
  rendererId: string;
  externalProcessing: boolean;
}

export interface DocumentVisionInput {
  pageIndex: number;
  width: number;
  height: number;
  grayscale: Uint8Array;
  rendererId: string;
  externalProcessing: boolean;
  analyzerVersion: 'mio-document-vision-input-v1';
}

const MAX_RENDER_PIXELS = 4_194_304;

export function prepareDocumentVisionInput(raster: DocumentPageRaster): DocumentVisionInput {
  if (!Number.isSafeInteger(raster.pageIndex) || raster.pageIndex < 0) throw new Error('Invalid rendered page index');
  if (!Number.isSafeInteger(raster.width) || !Number.isSafeInteger(raster.height) || raster.width <= 0 || raster.height <= 0) throw new Error('Invalid rendered page dimensions');
  if (!raster.rendererId.trim()) throw new Error('Document renderer provenance is required');
  const count = raster.width * raster.height;
  if (!Number.isSafeInteger(count) || count > MAX_RENDER_PIXELS) throw new Error('Rendered page exceeds 4MP vision-input budget');
  const channels = raster.pixelFormat === 'GRAYSCALE8' ? 1 : raster.pixelFormat === 'RGB8' ? 3 : 4;
  if (raster.pixels.length !== count * channels) throw new Error('Rendered page pixel buffer length mismatch');
  const grayscale = new Uint8Array(count);
  if (channels === 1) grayscale.set(raster.pixels);
  else for (let i=0;i<count;i+=1) {
    const base=i*channels, r=raster.pixels[base], g=raster.pixels[base+1], b=raster.pixels[base+2];
    grayscale[i]=Math.round(0.299*r+0.587*g+0.114*b);
  }
  return {pageIndex:raster.pageIndex,width:raster.width,height:raster.height,grayscale,rendererId:raster.rendererId,externalProcessing:raster.externalProcessing,analyzerVersion:'mio-document-vision-input-v1'};
}
