import html2canvas from 'html2canvas';

/**
 * Safely captures an HTML element to a canvas using html2canvas with optimal options for high-resolution rendering.
 */
export async function captureElementToCanvas(
  element: HTMLElement,
  customOptions: Record<string, any> = {}
): Promise<HTMLCanvasElement> {
  const defaultOptions = {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    ...customOptions
  };

  return html2canvas(element, defaultOptions);
}
